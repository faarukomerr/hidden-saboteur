import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { GameService } from "../services/GameService";
import { AIService } from "../services/AIService";
import { createClient } from 'redis';

// ── Centralized per-room state ──────────────────────────────────────────────
interface RoomState {
    language: string;
    roundId: string;
    targetWord: string;
    saboteurWords: string[];
    saboteurSocketId: string | null;
    timerTimeout: NodeJS.Timeout | null;
    endTime: number | null;
    scores: Record<string, number>; // socketId → score
    guesses: Record<string, number>; // socketId → guess count
    category: string;
    targetScore: number | null;
    narratorSocketId: string | null;
}

const rooms = new Map<string, RoomState>();
const socketUsername = new Map<string, string>();
const socketRoom = new Map<string, string>();

function getRoom(roomCode: string): RoomState {
    if (!rooms.has(roomCode)) {
        rooms.set(roomCode, {
            language: 'en', roundId: '', targetWord: '', saboteurWords: [],
            saboteurSocketId: null, timerTimeout: null, endTime: null, scores: {}, guesses: {}, category: 'Rastgele', targetScore: null, narratorSocketId: null
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

        // ── Start a new round  ─────────────────────────────────────────
        const startNewRound = async (roomCode: string) => {
            const state = getRoom(roomCode);
            clearTimer(roomCode);
            state.saboteurWords = [];
            state.saboteurSocketId = null;
            state.narratorSocketId = null;
            state.endTime = null;
            state.guesses = {};

            const roundData = await GameService.startRound(roomCode, state.language, state.category);
            state.roundId = roundData.roundId;
            state.targetWord = roundData.targetWord;

            // Ensure every player has a score entry
            const allIds = [roundData.roles.narrator, roundData.roles.saboteur, ...roundData.roles.guessers].filter(Boolean) as string[];
            for (const id of allIds) {
                if (!(id in state.scores)) state.scores[id] = 0;
            }

            // Emit roles
            state.narratorSocketId = roundData.roles.narrator;
            io.to(roundData.roles.narrator).emit('role_assigned', {
                role: 'narrator', targetWord: roundData.targetWord, roundId: roundData.roundId
            });
            if (roundData.roles.saboteur) {
                state.saboteurSocketId = roundData.roles.saboteur;
                io.to(roundData.roles.saboteur).emit('role_assigned', {
                    role: 'saboteur', targetWord: roundData.targetWord, roundId: roundData.roundId
                });
            }
            roundData.roles.guessers.forEach((gId: string) => {
                io.to(gId).emit('role_assigned', { role: 'guesser', roundId: roundData.roundId });
            });

            // Broadcast scores to all
            broadcastScores(roomCode);

            io.to(roomCode).emit('phase_changed', { phase: 'sabotage_input' });
            return roundData;
        };

        // ── Broadcast scores ────────────────────────────────────────────
        const broadcastScores = (roomCode: string) => {
            const state = getRoom(roomCode);
            const scoreList = Object.entries(state.scores).map(([socketId, points]) => ({
                name: socketUsername.get(socketId) || 'Anonim',
                socketId,
                points
            })).sort((a, b) => b.points - a.points);
            io.to(roomCode).emit('scores_update', { scores: scoreList });
        };

        // ── Timer ───────────────────────────────────────────────────────
        const startTimer = (roomCode: string, seconds: number) => {
            const state = getRoom(roomCode);
            clearTimer(roomCode);
            
            const endTime = Date.now() + seconds * 1000;
            state.endTime = endTime;

            io.to(roomCode).emit('timer_start', { endTime, total: seconds });

            state.timerTimeout = setTimeout(() => {
                clearTimer(roomCode);
                // Time expired → show round summary, wait for host to start next
                io.to(roomCode).emit('round_summary', {
                    targetWord: state.targetWord, winnerName: '', reason: 'timeout'
                });
            }, seconds * 1000);
        };

        // ── Connections ─────────────────────────────────────────────────
        io.on('connection', (socket: Socket) => {

            // 1. Join
            socket.on('join_room', async ({ roomCode, username }: { roomCode: string, username: string }) => {
                try {
                    socketUsername.set(socket.id, username);
                    socketRoom.set(socket.id, roomCode);
                    const players = await GameService.joinRoom(roomCode, socket.id, username);
                    socket.join(roomCode);
                    io.to(roomCode).emit('room_state_update', { players });

                    // Late join: sync timer + scores
                    const state = rooms.get(roomCode);
                    if (state) {
                        if (state.endTime && state.endTime > Date.now()) {
                            socket.emit('timer_start', { endTime: state.endTime, total: 0 });
                        }
                        broadcastScores(roomCode);
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 2. Start Game
            socket.on('start_game', async ({ roomCode, language, category, targetScore }: { roomCode: string, language?: string, category?: string, targetScore?: number | null }) => {
                try {
                    const state = getRoom(roomCode);
                    state.language = language || 'en';
                    state.category = category || 'Rastgele';
                    state.targetScore = targetScore || null;
                    state.scores = {}; // Reset scores for new game
                    await startNewRound(roomCode);
                } catch (error: any) {
                    console.error('start_game error:', error);
                    socket.emit('error', { message: error.message });
                }
            });

            // 3. Submit sabotage words
            socket.on('submit_sabotage', async ({ roomCode, roundId, words }: { roomCode: string, roundId: string, words: string[] }) => {
                try {
                    const authenticPlayerId = await GameService.getPlayerIdByUserId(roomCode, socket.id);
                    for (const w of words) {
                        await GameService.addSabotageWord(roundId, authenticPlayerId, w);
                    }

                    // Store words in room state so they persist through phase changes
                    const state = getRoom(roomCode);
                    state.saboteurWords = words;

                    socket.emit('sabotage_words_saved', { status: 'success', words });

                    const isReady = await GameService.checkSaboteursReady(roundId);
                    if (isReady) {
                        // Send saboteur their words list along with the phase change
                        if (state.saboteurSocketId) {
                            io.to(state.saboteurSocketId).emit('saboteur_words_list', { words: state.saboteurWords });
                        }
                        io.to(roomCode).emit('phase_changed', { phase: 'narration' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 4. Narrator sets timer
            socket.on('set_timer', ({ roomCode, durationSeconds }: { roomCode: string, durationSeconds: number }) => {
                const time = Math.max(60, Math.min(120, durationSeconds));
                startTimer(roomCode, time);
            });

            // 5. Guess
            socket.on('submit_guess', async ({ roomCode, roundId, guessWord }: { roomCode: string, roundId: string, guessWord: string }) => {
                try {
                    const state = getRoom(roomCode);
                    const attempts = state.guesses[socket.id] || 0;
                    
                    if (attempts >= 3) {
                        return socket.emit('error', { message: 'Tahmin hakkınız doldu!' });
                    }
                    
                    state.guesses[socket.id] = attempts + 1;
                    const name = socketUsername.get(socket.id) || 'Anonim';
                    const isCorrect = await GameService.checkGuess(roundId, guessWord);

                    if (isCorrect) {
                        clearTimer(roomCode);
                        state.scores[socket.id] = (state.scores[socket.id] || 0) + 10;
                        if (state.narratorSocketId) {
                            state.scores[state.narratorSocketId] = (state.scores[state.narratorSocketId] || 0) + 5;
                        }
                        broadcastScores(roomCode);

                        if (state.targetScore && state.scores[socket.id] >= state.targetScore) {
                            return io.to(roomCode).emit('grand_winner', {
                                winnerName: name,
                                targetWord: state.targetWord,
                                score: state.scores[socket.id]
                            });
                        }

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

            // 6. YANDI!
            socket.on('trigger_sabotage', async ({ roomCode, roundId, word }: { roomCode: string, roundId: string, word: string }) => {
                try {
                    const isValid = await GameService.verifySabotageWord(roundId, word);
                    if (isValid) {
                        clearTimer(roomCode);
                        const state = getRoom(roomCode);
                        // Scoring: saboteur +15
                        state.scores[socket.id] = (state.scores[socket.id] || 0) + 15;
                        broadcastScores(roomCode);

                        if (state.targetScore && state.scores[socket.id] >= state.targetScore) {
                            io.in(roomCode).emit('sabotage_confirmed', { word });
                            setTimeout(() => {
                                io.to(roomCode).emit('grand_winner', {
                                    winnerName: socketUsername.get(socket.id) || 'Sabotajcı',
                                    targetWord: state.targetWord,
                                    score: state.scores[socket.id]
                                });
                            }, 1500);
                            return;
                        }

                        io.in(roomCode).emit('sabotage_confirmed', { word });

                        setTimeout(async () => {
                            try {
                                const insult = await AIService.generateHostCommentary('Anlatıcı', word);
                                io.in(roomCode).emit('host_commentary', { message: insult });
                            } catch (e) { /* skip */ }
                            setTimeout(() => {
                                io.in(roomCode).emit('game_over', { reason: 'sabotage', word });
                            }, 3000);
                        }, 1500);
                    } else {
                        socket.emit('sabotage_failed', { reason: 'wrong' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 7. Restart (bug recovery)
            socket.on('restart_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    clearTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 8. Next round (host clicks button after round summary)
            socket.on('next_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    clearTimer(roomCode);
                    io.to(roomCode).emit('force_reset', {});
                    await startNewRound(roomCode);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 9. Return to lobby (preserve scores)
            socket.on('return_to_lobby', ({ roomCode }: { roomCode: string }) => {
                clearTimer(roomCode);
                io.to(roomCode).emit('force_reset', {});
                io.to(roomCode).emit('phase_changed', { phase: 'lobby' });
                broadcastScores(roomCode); // re-send scores so lobby shows them
            });

            // 10. Disconnect
            socket.on('disconnect', async () => {
                socketUsername.delete(socket.id);
                const room = socketRoom.get(socket.id);
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
