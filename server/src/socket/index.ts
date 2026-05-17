import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { GameService } from "../services/GameService";
import { AIService } from "../services/AIService";
import { createClient } from 'redis';

// ── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage { name: string; message: string; timestamp: number; }

interface RoomState {
    language: string;
    roundId: string;
    targetWord: string;
    saboteurWords: string[];
    saboteurSocketId: string | null;
    saboteurSocketIds: string[];
    saboteurNames: string[];
    timerTimeout: NodeJS.Timeout | null;
    votingTimeout: NodeJS.Timeout | null;
    cleanupTimeout: NodeJS.Timeout | null;
    endTime: number | null;
    scores: Record<string, number>;
    guesses: Record<string, number>;
    category: string;
    targetScore: number | null;
    narratorSocketId: string | null;
    hostSocketId: string | null;
    password?: string;
    phase: string;
    chatHistory: ChatMessage[];
    saboteursReady: Set<string>;
    narratorHistory: string[];
    roundCount: number;
    votes: Record<string, string>;  // voterUsername → votedForUsername
}

// ── Maps ─────────────────────────────────────────────────────────────────────
const rooms = new Map<string, RoomState>();
const socketUsername = new Map<string, string>();
const socketRoom = new Map<string, string>();
const playerRoles = new Map<string, { role: string; targetWord: string | null; roundId: string }>();
const rateLimits = new Map<string, Map<string, number>>();

function getRoom(roomCode: string): RoomState {
    if (!rooms.has(roomCode)) {
        rooms.set(roomCode, {
            language: 'en', roundId: '', targetWord: '', saboteurWords: [],
            saboteurSocketId: null, saboteurSocketIds: [], saboteurNames: [],
            timerTimeout: null, votingTimeout: null, cleanupTimeout: null,
            endTime: null, scores: {}, guesses: {}, category: 'Rastgele',
            targetScore: null, narratorSocketId: null, hostSocketId: null,
            phase: 'lobby', chatHistory: [], saboteursReady: new Set(),
            narratorHistory: [], roundCount: 0, votes: {},
        });
    }
    return rooms.get(roomCode)!;
}

function clearTimer(roomCode: string) {
    const state = rooms.get(roomCode);
    if (!state) return;
    if (state.timerTimeout) { clearTimeout(state.timerTimeout); state.timerTimeout = null; }
    state.endTime = null;
}

function clearVotingTimer(roomCode: string) {
    const state = rooms.get(roomCode);
    if (state?.votingTimeout) { clearTimeout(state.votingTimeout); state.votingTimeout = null; }
}

// Rate limiter — returns true if allowed
function checkRate(socketId: string, event: string, limitMs: number): boolean {
    if (!rateLimits.has(socketId)) rateLimits.set(socketId, new Map());
    const limits = rateLimits.get(socketId)!;
    const last = limits.get(event) || 0;
    const now = Date.now();
    if (now - last < limitMs) return false;
    limits.set(event, now);
    return true;
}

// Schedule room cleanup when empty (5 min)
function scheduleCleanup(roomCode: string, io: Server) {
    const state = rooms.get(roomCode);
    if (!state) return;
    if (state.cleanupTimeout) clearTimeout(state.cleanupTimeout);
    state.cleanupTimeout = setTimeout(() => {
        clearTimer(roomCode);
        rooms.delete(roomCode);
        for (const key of [...playerRoles.keys()]) {
            if (key.startsWith(`${roomCode}:`)) playerRoles.delete(key);
        }
        io.to(roomCode).emit('room_closed');
    }, 5 * 60 * 1000);
}

function cancelCleanup(roomCode: string) {
    const state = rooms.get(roomCode);
    if (state?.cleanupTimeout) { clearTimeout(state.cleanupTimeout); state.cleanupTimeout = null; }
}

export const initSocketServer = async (server: any) => {
    try {
        const io = new Server(server, {
            cors: { origin: '*', methods: ["GET", "POST"] },
            pingTimeout: 60000, pingInterval: 25000,
            transports: ['websocket', 'polling']
        });

        if (process.env.REDIS_URL) {
            try {
                const pubClient = createClient({ url: process.env.REDIS_URL });
                const subClient = pubClient.duplicate();
                await Promise.all([pubClient.connect(), subClient.connect()]);
                io.adapter(createAdapter(pubClient, subClient));
            } catch (e) { console.error('⚠️ Redis failed', e); }
        }

        // ── Broadcast scores ──────────────────────────────────────────────────
        const broadcastScores = (roomCode: string) => {
            const state = getRoom(roomCode);
            const scoreList = Object.entries(state.scores)
                .map(([name, points]) => ({ name, socketId: '', points }))
                .sort((a, b) => b.points - a.points);
            io.to(roomCode).emit('scores_update', { scores: scoreList });
        };

        // ── Resolve voting after delay or when all voted ──────────────────────
        const resolveVoting = async (roomCode: string) => {
            const state = rooms.get(roomCode);
            if (!state) return;
            clearVotingTimer(roomCode);

            const correctVoters: string[] = [];
            const sabNames = new Set(state.saboteurNames.map(n => n.toLowerCase()));

            for (const [voter, votedFor] of Object.entries(state.votes)) {
                if (sabNames.has(votedFor.toLowerCase())) {
                    state.scores[voter] = (state.scores[voter] || 0) + 5;
                    correctVoters.push(voter);
                }
            }

            if (correctVoters.length > 0) broadcastScores(roomCode);

            io.to(roomCode).emit('vote_results', {
                saboteurNames: state.saboteurNames,
                correctVoters,
            });

            // Check grand winner after bonus points
            let grandWinner: string | null = null;
            if (state.targetScore) {
                for (const [name, pts] of Object.entries(state.scores)) {
                    if (pts >= state.targetScore) { grandWinner = name; break; }
                }
            }

            setTimeout(() => {
                if (grandWinner) {
                    state.phase = 'grand_winner';
                    io.to(roomCode).emit('grand_winner', {
                        winnerName: grandWinner,
                        targetWord: state.targetWord,
                        score: state.scores[grandWinner],
                    });
                } else {
                    state.phase = 'game_over';
                    io.to(roomCode).emit('game_over', { reason: 'sabotage', word: state.targetWord });
                }
            }, 3500);
        };

        // ── Start a new round ─────────────────────────────────────────────────
        const startNewRound = async (roomCode: string) => {
            const state = getRoom(roomCode);
            clearTimer(roomCode);
            clearVotingTimer(roomCode);
            state.saboteurWords = [];
            state.saboteurSocketId = null;
            state.saboteurSocketIds = [];
            state.saboteurNames = [];
            state.narratorSocketId = null;
            state.endTime = null;
            state.guesses = {};
            state.saboteursReady = new Set();
            state.votes = {};

            const roundData = await GameService.startRound(roomCode, state.language, state.category);
            state.roundId = roundData.roundId;
            state.targetWord = roundData.targetWord;

            let { narrator, saboteur, guessers } = roundData.roles;
            const allIds = [narrator, ...(saboteur ? [saboteur] : []), ...guessers].filter(Boolean) as string[];

            // Narrator rotation: avoid recent narrators
            const maxRecent = Math.max(1, Math.floor(allIds.length / 2));
            const recentNarrators = state.narratorHistory.slice(-maxRecent);
            const currNarrName = socketUsername.get(narrator) || '';

            if (recentNarrators.includes(currNarrName) && guessers.length > 0) {
                const alt = guessers.find(g => !recentNarrators.includes(socketUsername.get(g) || ''));
                if (alt) {
                    guessers = guessers.filter(g => g !== alt);
                    guessers.push(narrator);
                    narrator = alt;
                }
            }

            const finalNarrName = socketUsername.get(narrator) || '';
            state.narratorHistory.push(finalNarrName);
            if (state.narratorHistory.length > 6) state.narratorHistory.shift();
            state.roundCount++;

            // Init scores (username-keyed)
            for (const id of allIds) {
                const name = socketUsername.get(id) || 'Anonim';
                if (!(name in state.scores)) state.scores[name] = 0;
            }

            // Assign saboteurs
            state.narratorSocketId = narrator;
            state.saboteurSocketId = saboteur || null;
            state.saboteurSocketIds = saboteur ? [saboteur] : [];

            if (allIds.length >= 6 && guessers.length >= 2) {
                state.saboteurSocketIds.push(guessers[0]);
            }
            const extraSaboteurId = state.saboteurSocketIds.length > 1 ? state.saboteurSocketIds[1] : null;

            // Track saboteur names for voting reveal
            for (const sabId of state.saboteurSocketIds) {
                const sName = socketUsername.get(sabId) || '';
                if (sName) state.saboteurNames.push(sName);
            }

            // Narrator role
            const narratorName = socketUsername.get(narrator) || '';
            playerRoles.set(`${roomCode}:${narratorName}`, { role: 'narrator', targetWord: roundData.targetWord, roundId: roundData.roundId });
            io.to(narrator).emit('role_assigned', { role: 'narrator', targetWord: roundData.targetWord, roundId: roundData.roundId });

            // Saboteur roles
            for (const sabId of state.saboteurSocketIds) {
                const sabName = socketUsername.get(sabId) || '';
                playerRoles.set(`${roomCode}:${sabName}`, { role: 'saboteur', targetWord: roundData.targetWord, roundId: roundData.roundId });
                io.to(sabId).emit('role_assigned', { role: 'saboteur', targetWord: roundData.targetWord, roundId: roundData.roundId });
            }

            // Guesser roles
            guessers.forEach((gId: string) => {
                if (gId === extraSaboteurId) return;
                const gName = socketUsername.get(gId) || '';
                playerRoles.set(`${roomCode}:${gName}`, { role: 'guesser', targetWord: null, roundId: roundData.roundId });
                io.to(gId).emit('role_assigned', { role: 'guesser', roundId: roundData.roundId });
            });

            broadcastScores(roomCode);
            io.to(roomCode).emit('round_info', { roundCount: state.roundCount });
            state.phase = 'sabotage_input';
            io.to(roomCode).emit('phase_changed', { phase: 'sabotage_input' });
            return roundData;
        };

        // ── Timer ─────────────────────────────────────────────────────────────
        const startTimer = (roomCode: string, seconds: number) => {
            const state = getRoom(roomCode);
            clearTimer(roomCode);
            const endTime = Date.now() + seconds * 1000;
            state.endTime = endTime;
            io.to(roomCode).emit('timer_start', { endTime, total: seconds });
            state.timerTimeout = setTimeout(() => {
                clearTimer(roomCode);
                state.phase = 'round_summary';
                io.to(roomCode).emit('round_summary', { targetWord: state.targetWord, winnerName: '', reason: 'timeout' });
            }, seconds * 1000);
        };

        // ── Connections ───────────────────────────────────────────────────────
        io.on('connection', (socket: Socket) => {

            // 1. Join
            socket.on('join_room', async ({ roomCode, username, password }: { roomCode: string; username: string; password?: string }) => {
                try {
                    const existingState = rooms.get(roomCode);

                    if (existingState?.password && existingState.password !== password) {
                        return socket.emit('error', { message: 'Yanlış oda şifresi!' });
                    }

                    // Max 10 players (skip check for reconnecting players)
                    const savedRole = existingState ? playerRoles.get(`${roomCode}:${username}`) : null;
                    if (!savedRole && existingState) {
                        const roomSockets = io.sockets.adapter.rooms.get(roomCode);
                        const currentCount = roomSockets ? roomSockets.size : 0;
                        if (currentCount >= 10) {
                            return socket.emit('error', { message: 'Oda dolu! Maksimum 10 oyuncu.' });
                        }
                    }

                    socketUsername.set(socket.id, username);
                    socketRoom.set(socket.id, roomCode);

                    const players = await GameService.joinRoom(roomCode, socket.id, username);
                    socket.join(roomCode);
                    io.to(roomCode).emit('room_state_update', { players });

                    const state = getRoom(roomCode);
                    cancelCleanup(roomCode);

                    // First joiner is host
                    if (!state.hostSocketId) state.hostSocketId = socket.id;
                    if (!state.password && password) state.password = password;

                    // Sync state
                    if (state.endTime && state.endTime > Date.now()) {
                        socket.emit('timer_start', { endTime: state.endTime, total: 0 });
                    }
                    broadcastScores(roomCode);
                    socket.emit('round_info', { roundCount: state.roundCount });

                    if (state.chatHistory.length > 0) {
                        socket.emit('chat_history', { messages: state.chatHistory.slice(-50) });
                    }

                    // Reconnection: resend role if mid-game
                    if (savedRole && state.phase !== 'lobby') {
                        if (savedRole.role === 'narrator') state.narratorSocketId = socket.id;
                        else if (savedRole.role === 'saboteur') {
                            state.saboteurSocketIds = state.saboteurSocketIds.filter(id => socketUsername.has(id));
                            if (!state.saboteurSocketIds.includes(socket.id)) state.saboteurSocketIds.push(socket.id);
                            if (!state.saboteurSocketId || !socketUsername.has(state.saboteurSocketId)) state.saboteurSocketId = socket.id;
                        }
                        socket.emit('role_assigned', { role: savedRole.role, targetWord: savedRole.targetWord, roundId: savedRole.roundId });
                        socket.emit('phase_changed', { phase: state.phase });
                        if (savedRole.role === 'saboteur' && state.phase === 'narration' && state.saboteurWords.length > 0) {
                            socket.emit('saboteur_words_list', { words: state.saboteurWords });
                        }
                    } else if (state.phase !== 'lobby') {
                        socket.emit('phase_changed', { phase: state.phase });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 2. Start game
            socket.on('start_game', async ({ roomCode, language, category, targetScore }: { roomCode: string; language?: string; category?: string; targetScore?: number | null }) => {
                try {
                    const state = getRoom(roomCode);
                    state.language = language || 'en';
                    state.category = category || 'Rastgele';
                    state.targetScore = targetScore || null;
                    state.scores = {};
                    state.roundCount = 0;
                    state.narratorHistory = [];
                    await startNewRound(roomCode);
                } catch (error: any) {
                    console.error('start_game error:', error);
                    socket.emit('error', { message: error.message });
                }
            });

            // 3. Restart game — reset scores (from grand_winner "play again")
            socket.on('restart_game', async ({ roomCode }: { roomCode: string }) => {
                try {
                    const state = getRoom(roomCode);
                    state.scores = {};
                    state.roundCount = 0;
                    state.narratorHistory = [];
                    clearTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 4. Submit sabotage words
            socket.on('submit_sabotage', async ({ roomCode, roundId, words }: { roomCode: string; roundId: string; words: string[] }) => {
                try {
                    const state = getRoom(roomCode);
                    state.saboteurWords = [...state.saboteurWords, ...words];
                    state.saboteursReady.add(socket.id);
                    socket.emit('sabotage_words_saved', { status: 'success', words });

                    if (socket.id === state.saboteurSocketId) {
                        try {
                            const playerId = await GameService.getPlayerIdByUserId(roomCode, socket.id);
                            for (const w of words) await GameService.addSabotageWord(roundId, playerId, w);
                        } catch (e) { /* non-fatal */ }
                    }

                    const sabIds = state.saboteurSocketIds;
                    const allReady = sabIds.length === 0 || sabIds.every(id => state.saboteursReady.has(id));
                    if (allReady) {
                        sabIds.forEach(sabId => io.to(sabId).emit('saboteur_words_list', { words: state.saboteurWords }));
                        state.phase = 'narration';
                        io.to(roomCode).emit('phase_changed', { phase: 'narration' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 5. Narrator sets timer
            socket.on('set_timer', ({ roomCode, durationSeconds }: { roomCode: string; durationSeconds: number }) => {
                const time = Math.max(60, Math.min(120, durationSeconds));
                startTimer(roomCode, time);
            });

            // 6. Guess
            socket.on('submit_guess', async ({ roomCode, roundId, guessWord }: { roomCode: string; roundId: string; guessWord: string }) => {
                try {
                    const state = getRoom(roomCode);
                    const attempts = state.guesses[socket.id] || 0;
                    if (attempts >= 3) return socket.emit('error', { message: 'Tahmin hakkınız doldu!' });
                    state.guesses[socket.id] = attempts + 1;

                    const name = socketUsername.get(socket.id) || 'Anonim';
                    const isCorrect = await GameService.checkGuess(roundId, guessWord);

                    if (isCorrect) {
                        clearTimer(roomCode);
                        state.scores[name] = (state.scores[name] || 0) + 10;
                        const narratorName = state.narratorSocketId ? socketUsername.get(state.narratorSocketId) : null;
                        if (narratorName) state.scores[narratorName] = (state.scores[narratorName] || 0) + 5;
                        broadcastScores(roomCode);

                        if (state.targetScore && (state.scores[name] >= state.targetScore || (narratorName && (state.scores[narratorName] || 0) >= state.targetScore))) {
                            const winner = (state.targetScore && state.scores[name] >= state.targetScore) ? name : narratorName!;
                            state.phase = 'grand_winner';
                            return io.to(roomCode).emit('grand_winner', { winnerName: winner, targetWord: state.targetWord, score: state.scores[winner] });
                        }

                        state.phase = 'round_summary';
                        io.to(roomCode).emit('round_summary', { targetWord: state.targetWord, winnerName: name, reason: 'guess' });
                    } else {
                        io.to(roomCode).emit('guess_result', { correct: false, guessWord, guesserName: name });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 7. YANDI! — triggers voting phase
            socket.on('trigger_sabotage', async ({ roomCode, roundId, word }: { roomCode: string; roundId: string; word: string }) => {
                try {
                    const state = getRoom(roomCode);
                    const wordNorm = word.toLowerCase().trim();
                    const isValid = state.saboteurWords.some(w => w.toLowerCase().trim() === wordNorm);
                    if (!isValid) return socket.emit('sabotage_failed', { reason: 'wrong' });

                    try { await GameService.verifySabotageWord(roundId, word); } catch (e) {}

                    clearTimer(roomCode);
                    const name = socketUsername.get(socket.id) || 'Sabotajcı';
                    state.scores[name] = (state.scores[name] || 0) + 15;
                    broadcastScores(roomCode);

                    io.in(roomCode).emit('sabotage_confirmed', { word });

                    // Check if saboteur already hit target score
                    const hitTarget = state.targetScore && state.scores[name] >= state.targetScore;

                    setTimeout(async () => {
                        try {
                            const narratorSocketId = state.narratorSocketId;
                            const narratorName = narratorSocketId ? (socketUsername.get(narratorSocketId) || 'Anlatıcı') : 'Anlatıcı';
                            const insult = await AIService.generateHostCommentary(narratorName, word);
                            io.in(roomCode).emit('host_commentary', { message: insult });
                        } catch (e) {}

                        if (hitTarget) {
                            setTimeout(() => {
                                state.phase = 'grand_winner';
                                io.to(roomCode).emit('grand_winner', { winnerName: name, targetWord: state.targetWord, score: state.scores[name] });
                            }, 1500);
                        } else {
                            // Start voting phase
                            const roomSockets = io.sockets.adapter.rooms.get(roomCode);
                            const allPlayers = roomSockets ? [...roomSockets].map(sid => socketUsername.get(sid) || '').filter(Boolean) : [];

                            state.phase = 'voting';
                            state.votes = {};
                            io.to(roomCode).emit('phase_changed', { phase: 'voting' });
                            io.to(roomCode).emit('voting_started', {
                                players: allPlayers,
                                saboteurCount: state.saboteurSocketIds.length,
                            });

                            // 15 second voting timeout
                            state.votingTimeout = setTimeout(() => resolveVoting(roomCode), 15000);
                        }
                    }, 1800);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 8. Submit vote
            socket.on('submit_vote', ({ roomCode, votedFor }: { roomCode: string; votedFor: string }) => {
                const state = getRoom(roomCode);
                if (state.phase !== 'voting') return;
                const name = socketUsername.get(socket.id) || '';
                if (!name || state.votes[name]) return; // already voted
                if (state.saboteurNames.some(n => n.toLowerCase() === name.toLowerCase())) return; // saboteurs don't vote

                state.votes[name] = votedFor;
                io.to(roomCode).emit('vote_cast', { voterName: name });

                // Get all non-saboteur players in room
                const roomSockets = io.sockets.adapter.rooms.get(roomCode);
                if (roomSockets) {
                    const nonSaboteurs = [...roomSockets].filter(sid => {
                        const n = socketUsername.get(sid) || '';
                        return !state.saboteurNames.some(s => s.toLowerCase() === n.toLowerCase());
                    });
                    // If all non-saboteurs voted, resolve early
                    if (Object.keys(state.votes).length >= nonSaboteurs.length && nonSaboteurs.length > 0) {
                        resolveVoting(roomCode);
                    }
                }
            });

            // 9. Emoji reaction
            socket.on('react_emoji', ({ roomCode, emoji }: { roomCode: string; emoji: string }) => {
                if (!checkRate(socket.id, 'react_emoji', 800)) return;
                const name = socketUsername.get(socket.id) || '';
                io.to(roomCode).emit('emoji_reaction', { name, emoji });
            });

            // 10. Chat
            socket.on('send_chat', ({ roomCode, message }: { roomCode: string; message: string }) => {
                if (!checkRate(socket.id, 'send_chat', 500)) return;
                const name = socketUsername.get(socket.id) || 'Anonim';
                const msg: ChatMessage = { name, message: message.slice(0, 200), timestamp: Date.now() };
                const state = getRoom(roomCode);
                state.chatHistory.push(msg);
                if (state.chatHistory.length > 100) state.chatHistory.shift();
                io.to(roomCode).emit('chat_message', msg);
            });

            // 11. Kick player (host only)
            socket.on('kick_player', async ({ roomCode, targetUsername }: { roomCode: string; targetUsername: string }) => {
                const state = getRoom(roomCode);
                if (socket.id !== state.hostSocketId) return;

                const targetSocketId = [...socketUsername.entries()]
                    .find(([sid, name]) => name === targetUsername && socketRoom.get(sid) === roomCode)?.[0];

                if (targetSocketId) {
                    io.to(targetSocketId).emit('kicked', { reason: 'Host sizi odadan çıkardı.' });
                    const targetSocket = io.sockets.sockets.get(targetSocketId);
                    targetSocket?.leave(roomCode);
                    socketUsername.delete(targetSocketId);
                    socketRoom.delete(targetSocketId);
                    playerRoles.delete(`${roomCode}:${targetUsername}`);
                    try {
                        const updates = await GameService.removePlayerByUserId(targetSocketId);
                        for (const u of updates) io.to(u.roomCode).emit('room_state_update', { players: u.players });
                    } catch (e) {}
                }
            });

            // 12. Restart round (bug recovery / host control)
            socket.on('restart_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    clearTimer(roomCode);
                    clearVotingTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 13. Next round (preserve scores)
            socket.on('next_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    clearTimer(roomCode);
                    clearVotingTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 14. Return to lobby
            socket.on('return_to_lobby', ({ roomCode }: { roomCode: string }) => {
                clearTimer(roomCode);
                clearVotingTimer(roomCode);
                const state = getRoom(roomCode);
                state.phase = 'lobby';
                io.to(roomCode).emit('force_reset', {});
                io.to(roomCode).emit('phase_changed', { phase: 'lobby' });
                broadcastScores(roomCode);
            });

            // 15. Disconnect
            socket.on('disconnect', async () => {
                const roomCode = socketRoom.get(socket.id);
                socketUsername.delete(socket.id);
                socketRoom.delete(socket.id);
                rateLimits.delete(socket.id);

                // Transfer host if needed
                if (roomCode) {
                    const state = rooms.get(roomCode);
                    if (state?.hostSocketId === socket.id) {
                        const roomSockets = io.sockets.adapter.rooms.get(roomCode);
                        state.hostSocketId = roomSockets && roomSockets.size > 0 ? [...roomSockets][0] : null;
                        if (state.hostSocketId) io.to(state.hostSocketId).emit('host_promoted');
                    }

                    const roomSockets = io.sockets.adapter.rooms.get(roomCode);
                    if (!roomSockets || roomSockets.size === 0) {
                        scheduleCleanup(roomCode, io);
                    }
                }

                try {
                    const updates = await GameService.removePlayerByUserId(socket.id);
                    for (const u of updates) io.to(u.roomCode).emit('room_state_update', { players: u.players });
                } catch (e) { console.error('Disconnect error:', e); }
            });
        });

        console.log('✅ Socket.io server initialized');
        return io;
    } catch (error) {
        console.error('❌ Socket server init failed:', error);
        throw error;
    }
};
