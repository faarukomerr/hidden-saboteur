import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { GameService } from "../services/GameService";
import { AIService } from "../services/AIService";
import { createClient } from 'redis';

export const initSocketServer = async (server: any) => {
    try {
        const io = new Server(server, {
            cors: {
                origin: '*',
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling']
        });

        if (process.env.REDIS_URL) {
            try {
                const pubClient = createClient({ url: process.env.REDIS_URL });
                const subClient = pubClient.duplicate();
                await Promise.all([pubClient.connect(), subClient.connect()]);
                console.log('✅ Redis connected for Socket.io scaling');
                io.adapter(createAdapter(pubClient, subClient));
            } catch (e) {
                console.error('⚠️ Redis connection failed, falling back to memory adapter.', e);
            }
        } else {
            console.log('ℹ️ No REDIS_URL provided, using default memory adapter.');
        }

        // Helper: assign and broadcast roles for a new round
        const startNewRound = async (roomCode: string, language: string) => {
            const roundData = await GameService.startRound(roomCode, language);

            // Narrator gets target word to describe
            io.to(roundData.roles.narrator).emit('role_assigned', {
                role: 'narrator',
                targetWord: roundData.targetWord,
                roundId: roundData.roundId
            });

            // Saboteur ALSO gets the target word so they can set traps wisely
            if (roundData.roles.saboteur) {
                io.to(roundData.roles.saboteur).emit('role_assigned', {
                    role: 'saboteur',
                    targetWord: roundData.targetWord,
                    roundId: roundData.roundId
                });
            }

            // All Guessers get their role + roundId
            roundData.roles.guessers.forEach((gId: string) => {
                io.to(gId).emit('role_assigned', { role: 'guesser', roundId: roundData.roundId });
            });

            // Tell the room that the Sabotage input phase has begun
            io.to(roomCode).emit('phase_changed', { phase: 'sabotage_input' });

            return roundData;
        };

        io.on('connection', (socket: Socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);

            // 1. Join Room
            socket.on('join_room', async ({ roomCode, username }: { roomCode: string, username: string }) => {
                try {
                    const players = await GameService.joinRoom(roomCode, socket.id, username);
                    socket.join(roomCode);
                    console.log(`✅ ${username} (${socket.id}) joined ${roomCode}`);
                    io.to(roomCode).emit('room_state_update', { players });
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 2. Start Game (host triggers this)
            socket.on('start_game', async ({ roomCode, language }: { roomCode: string, language?: string }) => {
                try {
                    console.log(`🎮 start_game for room ${roomCode}, language=${language}`);
                    await startNewRound(roomCode, language || 'en');
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
                    socket.emit('sabotage_words_saved', { status: 'success' });

                    // Since there is only 1 saboteur, this is always ready after 1 submission
                    const isReady = await GameService.checkSaboteursReady(roundId);
                    if (isReady) {
                        io.to(roomCode).emit('phase_changed', { phase: 'narration' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 4. Guesser submits a guess → correct = NEW ROUND, wrong = keep going
            socket.on('submit_guess', async ({ roomCode, roundId, guessWord, language }: { roomCode: string, roundId: string, guessWord: string, language?: string }) => {
                try {
                    const isCorrect = await GameService.checkGuess(roundId, guessWord);
                    if (isCorrect) {
                        const round = await GameService.getRoundById(roundId);
                        // Correct guess → celebrate then start a NEW round with same players
                        io.to(roomCode).emit('round_complete', {
                            guessWord,
                            targetWord: round?.targetWord
                        });
                        // After 4s animation, auto-start the next round
                        setTimeout(async () => {
                            try {
                                await startNewRound(roomCode, language || 'en');
                            } catch (e) {
                                console.error('Error starting next round:', e);
                            }
                        }, 4000);
                    } else {
                        io.to(roomCode).emit('guess_result', { correct: false, guessWord });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 5. YANDI! — Saboteur catches the Narrator saying a forbidden word → GAME OVER
            socket.on('trigger_sabotage', async ({ roomCode, roundId, word }: { roomCode: string, roundId: string, word: string }) => {
                try {
                    const isValid = await GameService.verifySabotageWord(roundId, word);
                    if (isValid) {
                        // Valid forbidden word → game ends, saboteur wins
                        io.in(roomCode).emit('sabotage_confirmed', { word, saboteurId: socket.id });

                        // Brief delay for celebration animation, then HOST COMMENTARY + GAME OVER
                        setTimeout(async () => {
                            try {
                                const insult = await AIService.generateHostCommentary('Narrator', word);
                                io.in(roomCode).emit('host_commentary', { message: insult });
                            } catch (e) { /* ignore AI errors */ }

                            // After commentary, emit game_over so everyone goes back to lobby
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

            // 6. Disconnect — clean up ghost player from DB
            socket.on('disconnect', async () => {
                console.log(`🔌 Client disconnected: ${socket.id}`);
                try {
                    const updates = await GameService.removePlayerByUserId(socket.id);
                    for (const u of updates) {
                        io.to(u.roomCode).emit('room_state_update', { players: u.players });
                    }
                } catch (e) {
                    console.error('Error handling disconnect:', e);
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
