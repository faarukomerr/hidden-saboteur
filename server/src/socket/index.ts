import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { GameService } from "../services/GameService";
import { AIService } from "../services/AIService";
import { createClient } from 'redis';

// ── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
    name: string;
    message: string;
    timestamp: number;
}

interface RoomState {
    language: string;
    roundId: string;
    targetWord: string;
    saboteurWords: string[];
    saboteurSocketId: string | null;        // primary (in DB)
    saboteurSocketIds: string[];            // all saboteur socket IDs
    timerTimeout: NodeJS.Timeout | null;
    endTime: number | null;
    scores: Record<string, number>;         // username → points (persists across reconnects)
    guesses: Record<string, number>;        // socketId → guess count
    category: string;
    targetScore: number | null;
    narratorSocketId: string | null;
    password?: string;
    phase: string;
    chatHistory: ChatMessage[];
    saboteursReady: Set<string>;            // socketIds that submitted words
}

// ── Maps ─────────────────────────────────────────────────────────────────────
const rooms = new Map<string, RoomState>();
const socketUsername = new Map<string, string>();
const socketRoom = new Map<string, string>();
// Reconnection: "roomCode:username" → saved role info
const playerRoles = new Map<string, { role: string; targetWord: string | null; roundId: string }>();

function getRoom(roomCode: string): RoomState {
    if (!rooms.has(roomCode)) {
        rooms.set(roomCode, {
            language: 'en', roundId: '', targetWord: '', saboteurWords: [],
            saboteurSocketId: null, saboteurSocketIds: [], timerTimeout: null, endTime: null,
            scores: {}, guesses: {}, category: 'Rastgele', targetScore: null,
            narratorSocketId: null, phase: 'lobby', chatHistory: [], saboteursReady: new Set()
        });
    }
    return rooms.get(roomCode)!;
}

function clearTimer(roomCode: string) {
    const state = rooms.get(roomCode);
    if (state?.timerTimeout) {
        clearTimeout(state.timerTimeout);
        state.timerTimeout = null;
        state.endTime = null;
    }
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
            } catch (e) {
                console.error('⚠️ Redis failed', e);
            }
        }

        // ── Broadcast scores (username-keyed) ────────────────────────────────
        const broadcastScores = (roomCode: string) => {
            const state = getRoom(roomCode);
            const scoreList = Object.entries(state.scores)
                .map(([name, points]) => ({ name, socketId: '', points }))
                .sort((a, b) => b.points - a.points);
            io.to(roomCode).emit('scores_update', { scores: scoreList });
        };

        // ── Start a new round ────────────────────────────────────────────────
        const startNewRound = async (roomCode: string) => {
            const state = getRoom(roomCode);
            clearTimer(roomCode);
            state.saboteurWords = [];
            state.saboteurSocketId = null;
            state.saboteurSocketIds = [];
            state.narratorSocketId = null;
            state.endTime = null;
            state.guesses = {};
            state.saboteursReady = new Set();

            const roundData = await GameService.startRound(roomCode, state.language, state.category);
            state.roundId = roundData.roundId;
            state.targetWord = roundData.targetWord;

            const { narrator, saboteur, guessers } = roundData.roles;
            const allIds = [narrator, saboteur, ...guessers].filter(Boolean) as string[];

            // Init scores (username-keyed — persists across reconnects)
            for (const id of allIds) {
                const name = socketUsername.get(id) || 'Anonim';
                if (!(name in state.scores)) state.scores[name] = 0;
            }

            // Assign saboteurs — add an extra one for 6+ player games
            state.narratorSocketId = narrator;
            state.saboteurSocketId = saboteur || null;
            state.saboteurSocketIds = saboteur ? [saboteur] : [];

            if (allIds.length >= 6 && guessers.length >= 2) {
                state.saboteurSocketIds.push(guessers[0]);
            }

            const extraSaboteurId = state.saboteurSocketIds.length > 1 ? state.saboteurSocketIds[1] : null;

            // Narrator
            const narratorName = socketUsername.get(narrator) || '';
            playerRoles.set(`${roomCode}:${narratorName}`, { role: 'narrator', targetWord: roundData.targetWord, roundId: roundData.roundId });
            io.to(narrator).emit('role_assigned', { role: 'narrator', targetWord: roundData.targetWord, roundId: roundData.roundId });

            // Saboteur(s)
            for (const sabId of state.saboteurSocketIds) {
                const sabName = socketUsername.get(sabId) || '';
                playerRoles.set(`${roomCode}:${sabName}`, { role: 'saboteur', targetWord: roundData.targetWord, roundId: roundData.roundId });
                io.to(sabId).emit('role_assigned', { role: 'saboteur', targetWord: roundData.targetWord, roundId: roundData.roundId });
            }

            // Guessers (skip extra saboteur)
            guessers.forEach((gId: string) => {
                if (gId === extraSaboteurId) return;
                const gName = socketUsername.get(gId) || '';
                playerRoles.set(`${roomCode}:${gName}`, { role: 'guesser', targetWord: null, roundId: roundData.roundId });
                io.to(gId).emit('role_assigned', { role: 'guesser', roundId: roundData.roundId });
            });

            broadcastScores(roomCode);
            state.phase = 'sabotage_input';
            io.to(roomCode).emit('phase_changed', { phase: 'sabotage_input' });
            return roundData;
        };

        // ── Timer ────────────────────────────────────────────────────────────
        const startTimer = (roomCode: string, seconds: number) => {
            const state = getRoom(roomCode);
            clearTimer(roomCode);

            const endTime = Date.now() + seconds * 1000;
            state.endTime = endTime;
            io.to(roomCode).emit('timer_start', { endTime, total: seconds });

            state.timerTimeout = setTimeout(() => {
                clearTimer(roomCode);
                state.phase = 'round_summary';
                io.to(roomCode).emit('round_summary', {
                    targetWord: state.targetWord, winnerName: '', reason: 'timeout'
                });
            }, seconds * 1000);
        };

        // ── Connections ──────────────────────────────────────────────────────
        io.on('connection', (socket: Socket) => {

            // 1. Join
            socket.on('join_room', async ({ roomCode, username, password }: { roomCode: string; username: string; password?: string }) => {
                try {
                    const existingState = rooms.get(roomCode);

                    // Password guard (skip if no password set on room)
                    if (existingState?.password && existingState.password !== password) {
                        return socket.emit('error', { message: 'Yanlış oda şifresi!' });
                    }

                    socketUsername.set(socket.id, username);
                    socketRoom.set(socket.id, roomCode);

                    const players = await GameService.joinRoom(roomCode, socket.id, username);
                    socket.join(roomCode);
                    io.to(roomCode).emit('room_state_update', { players });

                    const state = getRoom(roomCode);

                    // First joiner (host) can set the password
                    if (!state.password && password) {
                        state.password = password;
                    }

                    // Sync timer + scores
                    if (state.endTime && state.endTime > Date.now()) {
                        socket.emit('timer_start', { endTime: state.endTime, total: 0 });
                    }
                    broadcastScores(roomCode);

                    // Send recent chat history
                    if (state.chatHistory.length > 0) {
                        socket.emit('chat_history', { messages: state.chatHistory.slice(-50) });
                    }

                    // Reconnection: resend role if mid-game
                    const savedRole = playerRoles.get(`${roomCode}:${username}`);
                    if (savedRole && state.phase !== 'lobby') {
                        // Update narrator/saboteur socket ID references
                        if (savedRole.role === 'narrator') {
                            state.narratorSocketId = socket.id;
                        } else if (savedRole.role === 'saboteur') {
                            state.saboteurSocketIds = state.saboteurSocketIds.filter(id => socketUsername.has(id));
                            if (!state.saboteurSocketIds.includes(socket.id)) {
                                state.saboteurSocketIds.push(socket.id);
                            }
                            if (!state.saboteurSocketId || !socketUsername.has(state.saboteurSocketId)) {
                                state.saboteurSocketId = socket.id;
                            }
                        }

                        socket.emit('role_assigned', {
                            role: savedRole.role,
                            targetWord: savedRole.targetWord,
                            roundId: savedRole.roundId
                        });
                        socket.emit('phase_changed', { phase: state.phase });

                        // Re-send saboteur words if in narration
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
                    await startNewRound(roomCode);
                } catch (error: any) {
                    console.error('start_game error:', error);
                    socket.emit('error', { message: error.message });
                }
            });

            // 3. Submit sabotage words (supports multiple saboteurs)
            socket.on('submit_sabotage', async ({ roomCode, roundId, words }: { roomCode: string; roundId: string; words: string[] }) => {
                try {
                    const state = getRoom(roomCode);

                    // Accumulate words from all saboteurs
                    state.saboteurWords = [...state.saboteurWords, ...words];
                    state.saboteursReady.add(socket.id);

                    socket.emit('sabotage_words_saved', { status: 'success', words });

                    // DB save for primary saboteur only
                    if (socket.id === state.saboteurSocketId) {
                        try {
                            const playerId = await GameService.getPlayerIdByUserId(roomCode, socket.id);
                            for (const w of words) {
                                await GameService.addSabotageWord(roundId, playerId, w);
                            }
                        } catch (e) { /* non-fatal */ }
                    }

                    // All saboteurs ready?
                    const sabIds = state.saboteurSocketIds;
                    const allReady = sabIds.length === 0 || sabIds.every(id => state.saboteursReady.has(id));

                    if (allReady) {
                        sabIds.forEach(sabId => {
                            io.to(sabId).emit('saboteur_words_list', { words: state.saboteurWords });
                        });
                        state.phase = 'narration';
                        io.to(roomCode).emit('phase_changed', { phase: 'narration' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 4. Narrator sets timer
            socket.on('set_timer', ({ roomCode, durationSeconds }: { roomCode: string; durationSeconds: number }) => {
                const time = Math.max(60, Math.min(120, durationSeconds));
                startTimer(roomCode, time);
            });

            // 5. Guess
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

                        if (state.targetScore && state.scores[name] >= state.targetScore) {
                            state.phase = 'grand_winner';
                            return io.to(roomCode).emit('grand_winner', {
                                winnerName: name, targetWord: state.targetWord, score: state.scores[name]
                            });
                        }

                        state.phase = 'round_summary';
                        io.to(roomCode).emit('round_summary', {
                            targetWord: state.targetWord, winnerName: name, reason: 'guess'
                        });
                    } else {
                        io.to(roomCode).emit('guess_result', { correct: false, guessWord, guesserName: name });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 6. YANDI! — check in-memory (covers all saboteurs' words)
            socket.on('trigger_sabotage', async ({ roomCode, roundId, word }: { roomCode: string; roundId: string; word: string }) => {
                try {
                    const state = getRoom(roomCode);
                    const wordNorm = word.toLowerCase().trim();
                    const isValid = state.saboteurWords.some(w => w.toLowerCase().trim() === wordNorm);

                    if (!isValid) return socket.emit('sabotage_failed', { reason: 'wrong' });

                    // Best-effort DB mark
                    try { await GameService.verifySabotageWord(roundId, word); } catch (e) {}

                    clearTimer(roomCode);
                    const name = socketUsername.get(socket.id) || 'Sabotajcı';
                    state.scores[name] = (state.scores[name] || 0) + 15;
                    broadcastScores(roomCode);

                    if (state.targetScore && state.scores[name] >= state.targetScore) {
                        io.in(roomCode).emit('sabotage_confirmed', { word });
                        setTimeout(() => {
                            state.phase = 'grand_winner';
                            io.to(roomCode).emit('grand_winner', {
                                winnerName: name, targetWord: state.targetWord, score: state.scores[name]
                            });
                        }, 1500);
                        return;
                    }

                    io.in(roomCode).emit('sabotage_confirmed', { word });
                    setTimeout(async () => {
                        try {
                            const insult = await AIService.generateHostCommentary('Anlatıcı', word);
                            io.in(roomCode).emit('host_commentary', { message: insult });
                        } catch (e) {}
                        setTimeout(() => {
                            state.phase = 'game_over';
                            io.in(roomCode).emit('game_over', { reason: 'sabotage', word });
                        }, 3000);
                    }, 1500);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 7. Lobby chat
            socket.on('send_chat', ({ roomCode, message }: { roomCode: string; message: string }) => {
                const name = socketUsername.get(socket.id) || 'Anonim';
                const msg: ChatMessage = { name, message: message.slice(0, 200), timestamp: Date.now() };
                const state = getRoom(roomCode);
                state.chatHistory.push(msg);
                if (state.chatHistory.length > 100) state.chatHistory.shift();
                io.to(roomCode).emit('chat_message', msg);
            });

            // 8. Restart (bug recovery)
            socket.on('restart_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    clearTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 9. Next round
            socket.on('next_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    clearTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 10. Return to lobby (preserve scores)
            socket.on('return_to_lobby', ({ roomCode }: { roomCode: string }) => {
                clearTimer(roomCode);
                const state = getRoom(roomCode);
                state.phase = 'lobby';
                io.to(roomCode).emit('force_reset', {});
                io.to(roomCode).emit('phase_changed', { phase: 'lobby' });
                broadcastScores(roomCode);
            });

            // 11. Disconnect
            socket.on('disconnect', async () => {
                socketUsername.delete(socket.id);
                socketRoom.delete(socket.id);
                try {
                    const updates = await GameService.removePlayerByUserId(socket.id);
                    for (const u of updates) {
                        io.to(u.roomCode).emit('room_state_update', { players: u.players });
                    }
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
