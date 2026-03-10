import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { GameService } from "../services/GameService";
import { AIService } from "../services/AIService";
import { createClient } from 'redis';

export const initSocketServer = async (server: any) => {
    try {
        const io = new Server(server, {
            cors: { origin: '*', methods: ["GET", "POST"] },
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling']
        });

        if (process.env.REDIS_URL) {
            try {
                const pubClient = createClient({ url: process.env.REDIS_URL });
                const subClient = pubClient.duplicate();
                await Promise.all([pubClient.connect(), subClient.connect()]);
                console.log('✅ Redis connected');
                io.adapter(createAdapter(pubClient, subClient));
            } catch (e) {
                console.error('⚠️ Redis failed, using memory adapter.', e);
            }
        }

        // ─── Per-room state ──────────────────────────────────────────────
        const roomLanguage = new Map<string, string>();
        const roomTimers = new Map<string, NodeJS.Timeout>();     // countdown interval
        const roomTimeLeft = new Map<string, number>();            // seconds left
        const roomSaboteurWords = new Map<string, string[]>();     // words the saboteur planted
        const socketUsername = new Map<string, string>();          // socket.id → username

        // ─── Helper: start a new round ───────────────────────────────────
        const startNewRound = async (roomCode: string, language: string) => {
            // Clear existing timer
            const existingTimer = roomTimers.get(roomCode);
            if (existingTimer) clearInterval(existingTimer);
            roomTimers.delete(roomCode);
            roomTimeLeft.delete(roomCode);
            roomSaboteurWords.delete(roomCode);

            const roundData = await GameService.startRound(roomCode, language);

            // Narrator
            io.to(roundData.roles.narrator).emit('role_assigned', {
                role: 'narrator', targetWord: roundData.targetWord, roundId: roundData.roundId
            });

            // Saboteur (also gets target word)
            if (roundData.roles.saboteur) {
                io.to(roundData.roles.saboteur).emit('role_assigned', {
                    role: 'saboteur', targetWord: roundData.targetWord, roundId: roundData.roundId
                });
            }

            // Guessers
            roundData.roles.guessers.forEach((gId: string) => {
                io.to(gId).emit('role_assigned', { role: 'guesser', roundId: roundData.roundId });
            });

            io.to(roomCode).emit('phase_changed', { phase: 'sabotage_input' });
            return roundData;
        };

        // ─── Timer management ────────────────────────────────────────────
        const startRoundTimer = (roomCode: string, durationSeconds: number) => {
            const existingTimer = roomTimers.get(roomCode);
            if (existingTimer) clearInterval(existingTimer);

            roomTimeLeft.set(roomCode, durationSeconds);
            io.to(roomCode).emit('timer_sync', { timeLeft: durationSeconds });

            const interval = setInterval(() => {
                const current = roomTimeLeft.get(roomCode) || 0;
                const next = current - 1;
                roomTimeLeft.set(roomCode, next);

                io.to(roomCode).emit('timer_sync', { timeLeft: next });

                if (next <= 0) {
                    clearInterval(interval);
                    roomTimers.delete(roomCode);
                    roomTimeLeft.delete(roomCode);
                    // Time's up! → auto-start new round
                    io.to(roomCode).emit('round_complete', { guessWord: '', targetWord: 'Süre Doldu!' });
                    setTimeout(async () => {
                        try {
                            const lang = roomLanguage.get(roomCode) || 'en';
                            await startNewRound(roomCode, lang);
                        } catch (e) { console.error('Timer new round error:', e); }
                    }, 3000);
                }
            }, 1000);

            roomTimers.set(roomCode, interval);
        };

        // ─── Connections ─────────────────────────────────────────────────
        io.on('connection', (socket: Socket) => {
            console.log(`🔌 Connected: ${socket.id}`);

            // 1. Join Room
            socket.on('join_room', async ({ roomCode, username }: { roomCode: string, username: string }) => {
                try {
                    socketUsername.set(socket.id, username);
                    const players = await GameService.joinRoom(roomCode, socket.id, username);
                    socket.join(roomCode);
                    io.to(roomCode).emit('room_state_update', { players });

                    // Late join: if there's an active timer, sync it
                    const timeLeft = roomTimeLeft.get(roomCode);
                    if (timeLeft !== undefined) {
                        socket.emit('timer_sync', { timeLeft });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 2. Start Game
            socket.on('start_game', async ({ roomCode, language }: { roomCode: string, language?: string }) => {
                try {
                    const lang = language || 'en';
                    roomLanguage.set(roomCode, lang);
                    await startNewRound(roomCode, lang);
                } catch (error: any) {
                    console.error(`❌ start_game error:`, error);
                    socket.emit('error', { message: error.message });
                }
            });

            // 3. Saboteur submits trap words
            socket.on('submit_sabotage', async ({ roomCode, roundId, words }: { roomCode: string, roundId: string, words: string[] }) => {
                try {
                    const authenticPlayerId = await GameService.getPlayerIdByUserId(roomCode, socket.id);
                    for (const w of words) {
                        await GameService.addSabotageWord(roundId, authenticPlayerId, w);
                    }

                    // Store the saboteur's words so we can broadcast them back during narration
                    roomSaboteurWords.set(roomCode, words);
                    socket.emit('sabotage_words_saved', { status: 'success', words });

                    const isReady = await GameService.checkSaboteursReady(roundId);
                    if (isReady) {
                        io.to(roomCode).emit('phase_changed', { phase: 'narration' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 4. Narrator sets the timer duration
            socket.on('set_timer', async ({ roomCode, durationSeconds }: { roomCode: string, durationSeconds: number }) => {
                // Clamp to 60-120 range (1-2 minutes)
                const time = Math.max(60, Math.min(120, durationSeconds));
                startRoundTimer(roomCode, time);
                io.to(roomCode).emit('timer_started', { durationSeconds: time });
            });

            // 5. Guesser submits a guess (with username)
            socket.on('submit_guess', async ({ roomCode, roundId, guessWord }: { roomCode: string, roundId: string, guessWord: string }) => {
                try {
                    const guesserName = socketUsername.get(socket.id) || 'Anonim';
                    const isCorrect = await GameService.checkGuess(roundId, guessWord);

                    if (isCorrect) {
                        const round = await GameService.getRoundById(roundId);
                        // Stop timer
                        const timer = roomTimers.get(roomCode);
                        if (timer) clearInterval(timer);
                        roomTimers.delete(roomCode);
                        roomTimeLeft.delete(roomCode);

                        io.to(roomCode).emit('round_complete', {
                            guessWord, targetWord: round?.targetWord, winnerName: guesserName
                        });
                        setTimeout(async () => {
                            try {
                                const lang = roomLanguage.get(roomCode) || 'en';
                                await startNewRound(roomCode, lang);
                            } catch (e) { console.error('Next round error:', e); }
                        }, 4000);
                    } else {
                        io.to(roomCode).emit('guess_result', { correct: false, guessWord, guesserName });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 6. YANDI! (Saboteur catches narrator)
            socket.on('trigger_sabotage', async ({ roomCode, roundId, word }: { roomCode: string, roundId: string, word: string }) => {
                try {
                    const isValid = await GameService.verifySabotageWord(roundId, word);
                    if (isValid) {
                        // Stop timer
                        const timer = roomTimers.get(roomCode);
                        if (timer) clearInterval(timer);
                        roomTimers.delete(roomCode);
                        roomTimeLeft.delete(roomCode);

                        io.in(roomCode).emit('sabotage_confirmed', { word, saboteurId: socket.id });

                        setTimeout(async () => {
                            try {
                                const narratorName = 'Anlatıcı';
                                const insult = await AIService.generateHostCommentary(narratorName, word);
                                io.in(roomCode).emit('host_commentary', { message: insult });
                            } catch (e) { /* ignore AI */ }
                            setTimeout(() => {
                                io.in(roomCode).emit('game_over', { reason: 'sabotage', word });
                            }, 4000);
                        }, 1500);
                    } else {
                        socket.emit('sabotage_failed', { reason: 'fake_word' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 7. Restart round (bug recovery)
            socket.on('restart_round', async ({ roomCode }: { roomCode: string }) => {
                try {
                    const timer = roomTimers.get(roomCode);
                    if (timer) clearInterval(timer);
                    roomTimers.delete(roomCode);
                    roomTimeLeft.delete(roomCode);

                    const lang = roomLanguage.get(roomCode) || 'en';
                    await startNewRound(roomCode, lang);
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 8. Return to lobby
            socket.on('return_to_lobby', async ({ roomCode }: { roomCode: string }) => {
                const timer = roomTimers.get(roomCode);
                if (timer) clearInterval(timer);
                roomTimers.delete(roomCode);
                roomTimeLeft.delete(roomCode);

                io.to(roomCode).emit('phase_changed', { phase: 'lobby' });
            });

            // 9. Disconnect — clean ghost
            socket.on('disconnect', async () => {
                console.log(`🔌 Disconnected: ${socket.id}`);
                socketUsername.delete(socket.id);
                try {
                    const updates = await GameService.removePlayerByUserId(socket.id);
                    for (const u of updates) {
                        io.to(u.roomCode).emit('room_state_update', { players: u.players });
                    }
                } catch (e) {
                    console.error('Disconnect error:', e);
                }
            });
        });

        console.log('✅ Socket.io server initialized');
        return io;
    } catch (error) {
        console.error('❌ Failed to initialize Socket server:', error);
        throw error;
    }
};
