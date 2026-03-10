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
    timerInterval: NodeJS.Timeout | null;
    timeLeft: number;
    scores: Record<string, number>; // socketId → score
}

const rooms = new Map<string, RoomState>();
const socketUsername = new Map<string, string>();
const socketRoom = new Map<string, string>();

function getRoom(roomCode: string): RoomState {
    if (!rooms.has(roomCode)) {
        rooms.set(roomCode, {
            language: 'en', roundId: '', targetWord: '', saboteurWords: [],
            saboteurSocketId: null, timerInterval: null, timeLeft: 0, scores: {}
        });
    }
    return rooms.get(roomCode)!;
}

function clearTimer(roomCode: string) {
    const state = rooms.get(roomCode);
    if (state?.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.timeLeft = 0;
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
            state.timeLeft = 0;

            const roundData = await GameService.startRound(roomCode, state.language);
            state.roundId = roundData.roundId;
            state.targetWord = roundData.targetWord;

            // Ensure every player has a score entry
            const allIds = [roundData.roles.narrator, roundData.roles.saboteur, ...roundData.roles.guessers].filter(Boolean) as string[];
            for (const id of allIds) {
                if (!(id in state.scores)) state.scores[id] = 0;
            }

            // Emit roles
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
            state.timeLeft = seconds;

            io.to(roomCode).emit('timer_sync', { timeLeft: seconds, total: seconds });

            state.timerInterval = setInterval(() => {
                state.timeLeft--;
                io.to(roomCode).emit('timer_sync', { timeLeft: state.timeLeft, total: seconds });

                if (state.timeLeft <= 0) {
                    clearTimer(roomCode);
                    // Time expired → show round summary, wait for host to start next
                    io.to(roomCode).emit('round_summary', {
                        targetWord: state.targetWord, winnerName: '', reason: 'timeout'
                    });
                }
            }, 1000);
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
                        if (state.timeLeft > 0) socket.emit('timer_sync', { timeLeft: state.timeLeft, total: 0 });
                        broadcastScores(roomCode);
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 2. Start Game
            socket.on('start_game', async ({ roomCode, language }: { roomCode: string, language?: string }) => {
                try {
                    const state = getRoom(roomCode);
                    state.language = language || 'en';
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
                    const name = socketUsername.get(socket.id) || 'Anonim';
                    const isCorrect = await GameService.checkGuess(roundId, guessWord);

                    if (isCorrect) {
                        clearTimer(roomCode);
                        const state = getRoom(roomCode);
                        state.scores[socket.id] = (state.scores[socket.id] || 0) + 10;
                        broadcastScores(roomCode);

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
