import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../lib/SocketContext';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { SabotageInputPhase } from '../components/game/SabotageInputPhase';
import { NarratorView } from '../components/game/NarratorView';
import { PlayerActionView } from '../components/game/PlayerActionView';
import { useLanguage } from '../lib/i18n';
import { LanguageToggle } from '../components/ui/LanguageToggle';

interface Player {
    id: string;
    name: string;
    score: number;
}

export const Lobby = () => {
    const { id: roomCode } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { socket } = useSocket();

    const username = searchParams.get('user');
    const isHost = searchParams.get('host') === 'true';

    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<'lobby' | 'sabotage_input' | 'narration'>('lobby');
    const { t } = useLanguage();

    // Roles assigned by server
    const [myRole, setMyRole] = useState<'narrator' | 'guesser' | 'saboteur' | null>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);

    useEffect(() => {
        if (!socket || !roomCode || !username) {
            navigate('/');
            return;
        }

        socket.on('room_state_update', (data: { players: Player[] }) => {
            if (data.players) setPlayers(data.players);
        });

        socket.on('role_assigned', (data: { role: any, targetWord?: string }) => {
            setMyRole(data.role);
            if (data.targetWord) setTargetWord(data.targetWord);
        });

        socket.on('phase_changed', (data: { phase: typeof phase }) => {
            setPhase(data.phase);
        });

        return () => {
            socket.off('room_state_update');
            socket.off('role_assigned');
            socket.off('phase_changed');
        };
    }, [socket, roomCode, username, navigate]);

    const handleStartGame = () => {
        if (players.length < 3) {
            alert(t('needPlayersAlert'));
            return;
        }
        socket?.emit('start_game', { roomCode });
    };

    if (phase === 'sabotage_input' && myRole === 'saboteur') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6">
                <SabotageInputPhase roomCode={roomCode!} roundId="1" /> {/* Replace 1 with actual round from server in future */}
            </div>
        )
    }

    if (phase === 'sabotage_input' && myRole !== 'saboteur') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <NeonCard className="max-w-md">
                    <p className="text-xl text-brand-cyan font-bold tracking-widest uppercase mb-4 animate-pulse">
                        {t('saboteursSettingTraps')}
                    </p>
                    <p className="text-white/60">{t('getReady')}</p>
                </NeonCard>
            </div>
        )
    }

    // Active Gameplay Phase handling
    if (phase === 'narration') {
        if (myRole === 'narrator') {
            return <NarratorView targetWord={targetWord || 'Loading...'} />;
        }

        const handleYandi = () => {
            const word = prompt("What word did the Narrator say?"); // Basic MVP implementation, in full version use a visual input modal
            if (word) {
                socket?.emit('trigger_sabotage', { roomCode, roundId: "1", word });
            }
        };

        const handleGuess = (guessWord: string) => {
            socket?.emit('submit_guess', { roomCode, guessWord });
        };

        return <PlayerActionView role={myRole as 'saboteur' | 'guesser'} onSabotage={handleYandi} onGuess={handleGuess} />;
    }

    return (
        <div className="flex flex-col items-center min-h-screen p-6 pt-20 relative">
            <LanguageToggle />
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center mb-12"
            >
                <p className="text-white/50 uppercase tracking-[0.3em] font-bold text-sm mb-2">{t('roomCode')}</p>
                <h1 className="text-7xl md:text-9xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-brand-cyan to-blue-500 drop-shadow-[0_0_20px_rgba(0,240,255,0.4)]">
                    {roomCode}
                </h1>
            </motion.div>

            <div className="w-full max-w-2xl grid gap-6 md:grid-cols-2">
                <NeonCard>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold uppercase tracking-wider">{t('players')}</h2>
                        <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-bold">{players.length}/8</span>
                    </div>

                    <div className="space-y-3">
                        <AnimatePresence>
                            {players.map((p, idx) => (
                                <motion.div
                                    key={p.name + idx}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="flex items-center justify-between bg-black/50 border border-white/5 rounded-xl p-4"
                                >
                                    <span className="font-semibold text-lg">{p.name} {p.name === username && t('you')}</span>
                                    <span className="text-brand-cyan font-bold font-mono">{p.score} pt</span>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {players.length === 0 && (
                            <div className="p-8 text-center text-white/40 italic">{t('waitingPlayers')}</div>
                        )}
                    </div>
                </NeonCard>

                <div className="flex flex-col gap-6">
                    <NeonCard variant="secondary" className="flex-grow flex flex-col justify-center text-center">
                        <h3 className="text-xl font-bold mb-2">{t('rulesTitle')}</h3>
                        <p className="text-white/70 text-sm">
                            {t('rulesText1')}<br /><br />
                            {t('rulesText2')} <span className="text-brand-pink font-bold">YANDI!</span>
                        </p>
                    </NeonCard>

                    {isHost ? (
                        <Button
                            size="xl"
                            className="w-full py-8 text-3xl"
                            onClick={handleStartGame}
                            disabled={players.length < 3}
                        >
                            {t('startGame')}
                        </Button>
                    ) : (
                        <div className="p-6 text-center border-2 border-dashed border-white/20 rounded-3xl">
                            <p className="text-white/50 animate-pulse font-bold tracking-widest uppercase">
                                {t('waitingHost')}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
