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

        const room = await prisma.room.findUnique({ where: { roomCode } });
        if (!room) throw new Error('Room not found');

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

    static async startRound(roomCode: string) {
        const room = await prisma.room.findUnique({
            where: { roomCode },
            include: { players: true, rounds: true }
        });
        if (!room) throw new Error('Room not found');

        const players = room.players;
        if (players.length < 3) throw new Error('Need at least 3 players'); // Minimum 3 players required

        // Randomize roles
        const shuffled = players.sort(() => 0.5 - Math.random());
        const narrator = shuffled[0];
        const guesser = shuffled[1];
        const saboteurs = shuffled.slice(2);

        // Generate Word via Gemini
        const words = await AIService.generateTargetWords("Everyday Objects", "Medium");
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

        // Assign Roles
        const roleCreations = [];
        roleCreations.push(prisma.role.create({ data: { roundId: round.id, playerId: narrator.id, roleType: 'narrator' } }));
        roleCreations.push(prisma.role.create({ data: { roundId: round.id, playerId: guesser.id, roleType: 'guesser' } }));

        for (const sab of saboteurs) {
            roleCreations.push(prisma.role.create({ data: { roundId: round.id, playerId: sab.id, roleType: 'saboteur' } }));
        }
        await Promise.all(roleCreations);

        return {
            roundId: round.id,
            targetWord,
            roles: {
                narrator: narrator.userId,
                guesser: guesser.userId,
                saboteurs: saboteurs.map((s: any) => s.userId)
            }
        };
    }

    static async addSabotageWord(roundId: string, playerId: string, word: string) {
        await prisma.sabotageWord.create({
            data: { roundId, playerId, word: word.toLowerCase() }
        });
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
