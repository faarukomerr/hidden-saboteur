import { PrismaClient } from '@prisma/client';
import { AIService } from './AIService';

const prisma = new PrismaClient();

export class GameService {

    // Create a new room with a random 6 char code
    static async createRoom(hostId: string): Promise<string> {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        await prisma.room.create({
            data: {
                roomCode,
                hostId,
                status: 'waiting'
            }
        });
        return roomCode;
    }

    static async joinRoom(roomCode: string, userId: string, username: string) {
        let user = await prisma.user.findFirst({ where: { id: userId } });
        if (!user) {
            user = await prisma.user.create({ data: { id: userId, username } });
        }

        let room = await prisma.room.findUnique({ where: { roomCode } });
        if (!room) {
            // Auto-create the room if it doesn't exist yet, setting the first person as host
            room = await prisma.room.create({
                data: {
                    roomCode,
                    hostId: user.id,
                    status: 'waiting'
                }
            });
        }

        // Upsert player to room
        await prisma.player.upsert({
            where: { roomId_userId: { roomId: room.id, userId: user.id } },
            update: {}, // Already in room
            create: { roomId: room.id, userId: user.id }
        });

        // Get updated player list
        const players = await prisma.player.findMany({
            where: { roomId: room.id },
            include: { user: true }
        });

        return players.map((p: any) => ({ id: p.user.id, name: p.user.username, score: p.score }));
    }

    static async startRound(roomCode: string, activeSocketIds?: string[], language: string = 'en') {
        const room = await prisma.room.findUnique({
            where: { roomCode },
            include: { players: true, rounds: true }
        });
        if (!room) throw new Error('Room not found');

        let players = room.players;
        if (activeSocketIds) {
            players = players.filter(p => activeSocketIds.includes(p.userId));
        }
        if (players.length < 1) throw new Error('Need at least 1 player'); // Minimum 1 for testing

        // Randomize roles: 1 Narrator, 1 Saboteur, everyone else Guesses
        const shuffled = players.sort(() => 0.5 - Math.random());
        const narrator = shuffled[0];
        const saboteur = players.length > 1 ? shuffled[1] : null; // Saboteur also gets the target word
        const guessers = players.length > 2 ? shuffled.slice(2) : []; // Everyone else guesses

        // Generate Word via Gemini in the chosen language
        const words = await AIService.generateTargetWords("Everyday Objects", "Medium", language);
        const targetWord = words[Math.floor(Math.random() * words.length)];

        // Create Round
        const roundNumber = room.rounds.length + 1;
        const round = await prisma.round.create({
            data: {
                roomId: room.id,
                roundNumber,
                targetWord,
                status: 'sabotage_phase'
            }
        });

        // Assign Roles in DB
        const roleCreations = [];
        roleCreations.push(prisma.role.create({ data: { roundId: round.id, playerId: narrator.id, roleType: 'narrator' } }));
        if (saboteur) {
            roleCreations.push(prisma.role.create({ data: { roundId: round.id, playerId: saboteur.id, roleType: 'saboteur' } }));
        }
        for (const g of guessers) {
            roleCreations.push(prisma.role.create({ data: { roundId: round.id, playerId: g.id, roleType: 'guesser' } }));
        }
        await Promise.all(roleCreations);

        return {
            roundId: round.id,
            targetWord,
            roles: {
                narrator: narrator.userId,
                saboteur: saboteur ? saboteur.userId : null,
                guessers: guessers.map((g: any) => g.userId)
            }
        };
    }

    static async getPlayerIdByUserId(roomCode: string, userId: string): Promise<string> {
        const room = await prisma.room.findUnique({ where: { roomCode } });
        if (!room) throw new Error('Room not found');

        const player = await prisma.player.findUnique({
            where: { roomId_userId: { roomId: room.id, userId } }
        });
        if (!player) throw new Error('Player not found in room');
        return player.id;
    }

    static async removePlayerByUserId(userId: string): Promise<{ roomCode: string, players: any[] }[]> {
        const players = await prisma.player.findMany({
            where: { userId },
            include: { room: true }
        });

        const updates = [];

        for (const p of players) {
            await prisma.player.delete({ where: { id: p.id } });

            const remainingPlayers = await prisma.player.findMany({
                where: { roomId: p.roomId },
                include: { user: true }
            });

            updates.push({
                roomCode: p.room.roomCode,
                players: remainingPlayers.map((rp: any) => ({ id: rp.user.id, name: rp.user.username, score: rp.score }))
            });
        }
        return updates;
    }

    static async checkGuess(roundId: string, guessWord: string): Promise<boolean> {
        const round = await prisma.round.findUnique({ where: { id: roundId } });
        if (!round) return false;
        return round.targetWord.toLowerCase() === guessWord.trim().toLowerCase();
    }

    static async getRoundById(roundId: string) {
        return prisma.round.findUnique({ where: { id: roundId } });
    }

    static async addSabotageWord(roundId: string, playerId: string, word: string) {
        await prisma.sabotageWord.create({
            data: { roundId, playerId, word: word.toLowerCase() }
        });
    }

    static async checkSaboteursReady(roundId: string): Promise<boolean> {
        // 1. Get total number of saboteurs assigned to this round
        const saboteursCount = await prisma.role.count({
            where: { roundId, roleType: 'saboteur' }
        });

        // 2. Get unique playerId count from sabotageWord table
        const submittedWords = await prisma.sabotageWord.findMany({
            where: { roundId },
            select: { playerId: true },
            distinct: ['playerId']
        });

        // If no saboteurs exist (solo testing) or all have submitted, transition.
        return saboteursCount === 0 || submittedWords.length >= saboteursCount;
    }

    static async verifySabotageWord(roundId: string, allegedWord: string): Promise<boolean> {
        const words = await prisma.sabotageWord.findMany({
            where: { roundId, isTriggered: false } // only check untriggered words
        });

        const match = words.find((w: any) => w.word.toLowerCase() === allegedWord.toLowerCase());

        if (match) {
            await prisma.sabotageWord.update({
                where: { id: match.id },
                data: { isTriggered: true }
            });
            return true;
        }
        return false;
    }
}
