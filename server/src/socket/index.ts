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

        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        try {
            const pubClient = createClient({ url: redisUrl });
            const subClient = pubClient.duplicate();

            await Promise.all([pubClient.connect(), subClient.connect()]);
            console.log('✅ Redis connected for Socket.io scaling');
            io.adapter(createAdapter(pubClient, subClient));
        } catch (e) {
            console.log('⚠️ Redis not available, falling back to memory adapter for local dev.');
        }

        io.on('connection', (socket: Socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);

            // 1. Join Room
            socket.on('join_room', async ({ roomCode, username }: { roomCode: string, username: string }) => {
                try {
                    const players = await GameService.joinRoom(roomCode, socket.id, username);
                    socket.join(roomCode);
                    console.log(`${username} joined ${roomCode}`);

                    // Notify everyone in the room about the updated player list
                    io.to(roomCode).emit('room_state_update', { players });
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 2. Start Game
            socket.on('start_game', async ({ roomCode }: { roomCode: string }) => {
                try {
                    const roundData = await GameService.startRound(roomCode);

                    // Announce roles privately
                    io.to(roundData.roles.narrator).emit('role_assigned', { role: 'narrator', targetWord: roundData.targetWord });
                    io.to(roundData.roles.guesser).emit('role_assigned', { role: 'guesser' });

                    roundData.roles.saboteurs.forEach((sabId: string) => {
                        io.to(sabId).emit('role_assigned', { role: 'saboteur' });
                    });

                    // Tell the room that the Sabotage phase has begun
                    io.to(roomCode).emit('phase_changed', { phase: 'sabotage_input' });
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 3. Submit Sabotage Words
            socket.on('submit_sabotage', async ({ roomCode, roundId, words }: { roomCode: string, roundId: string, words: string[] }) => {
                try {
                    for (const w of words) {
                        await GameService.addSabotageWord(roundId, socket.id, w);
                    }
                    socket.emit('sabotage_words_saved', { status: 'success' });
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            // 4. "YANDI!" (Sabotage) Action
            socket.on('trigger_sabotage', async ({ roomCode, roundId, word }: { roomCode: string, roundId: string, word: string }) => {
                try {
                    const isValid = await GameService.verifySabotageWord(roundId, word);

                    if (isValid) {
                        // Explosion and Score update
                        io.in(roomCode).emit('sabotage_confirmed', {
                            word,
                            saboteurId: socket.id,
                            animation: 'EXPLOSION'
                        });

                        // Wait for animation then generate Gemini Host insult
                        setTimeout(async () => {
                            const insult = await AIService.generateHostCommentary('Narrator', word);
                            io.in(roomCode).emit('host_commentary', { message: insult });
                        }, 2000);

                    } else {
                        socket.emit('sabotage_failed', { reason: 'fake_word' });
                    }
                } catch (error: any) {
                    socket.emit('error', { message: error.message });
                }
            });

            socket.on('disconnect', () => {
                console.log(`🔌 Client disconnected: ${socket.id}`);
            });
        });

        console.log('✅ Socket.io server initialized');
        return io;
    } catch (error) {
        console.error('❌ Failed to initialize Socket server:', error);
        throw error;
    }
};
