import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../lib/SocketContext';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
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
    const { socket, isConnected } = useSocket();

    const username = searchParams.get('user');
    const isHost = searchParams.get('host') === 'true';

    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<'lobby' | 'sabotage_input' | 'narration' | 'game_over'>('lobby');
    const { t, language } = useLanguage();

    // Roles assigned by server
    const [myRole, setMyRole] = useState<'narrator' | 'guesser' | 'saboteur' | null>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);
    const [roundId, setRoundId] = useState<string>('1');

    // Game event feedback states
    const [yandiWord, setYandiWord] = useState('');
    const [showYandiInput, setShowYandiInput] = useState(false);
    const [gameEvent, setGameEvent] = useState<{ type: 'sabotage' | 'wrong_guess' | 'correct_guess' | 'commentary', message: string } | null>(null);
    const [hostCommentary, setHostCommentary] = useState<string | null>(null);

    useEffect(() => {
        if (!socket || !roomCode || !username) {
            navigate('/');
            return;
        }

        if (isConnected) {
            socket.emit('join_room', { roomCode, username });
        }

        socket.on('room_state_update', (data: { players: Player[] }) => {
            if (data.players) setPlayers(data.players);
        });

        socket.on('role_assigned', (data: { role: any, targetWord?: string, roundId?: string }) => {
            setMyRole(data.role);
            if (data.targetWord) setTargetWord(data.targetWord);
            if (data.roundId) setRoundId(data.roundId);
        });

        socket.on('phase_changed', (data: { phase: any }) => {
            setPhase(data.phase);
        });

        socket.on('sabotage_confirmed', (data: { word: string, saboteurId: string }) => {
            setGameEvent({ type: 'sabotage', message: `🔥 YANDI! "${data.word}" kelimesi yakalandı!` });
            setTimeout(() => setGameEvent(null), 4000);
        });

        socket.on('sabotage_failed', () => {
            setGameEvent({ type: 'wrong_guess', message: `❌ Yanlış kelime! Bu yasaklı kelimelerden biri değildi.` });
            setTimeout(() => setGameEvent(null), 3000);
        });

        socket.on('host_commentary', (data: { message: string }) => {
            setHostCommentary(data.message);
            setTimeout(() => setHostCommentary(null), 6000);
        });

        socket.on('guess_result', (data: { correct: boolean, guessWord: string, targetWord?: string }) => {
            if (data.correct) {
                setGameEvent({ type: 'correct_guess', message: `🎉 Doğru tahmin! Kelime "${data.guessWord}" idi!` });
            } else {
                setGameEvent({ type: 'wrong_guess', message: `❌ Yanlış tahmin: "${data.guessWord}"` });
            }
            setTimeout(() => setGameEvent(null), 3000);
        });

        return () => {
            socket.off('room_state_update');
            socket.off('role_assigned');
            socket.off('phase_changed');
            socket.off('sabotage_confirmed');
            socket.off('sabotage_failed');
            socket.off('host_commentary');
            socket.off('guess_result');
        };
    }, [socket, isConnected, roomCode, username, navigate]);

    const handleStartGame = () => {
        if (players.length < 1) {
            alert(t('needPlayersAlert'));
            return;
        }
        socket?.emit('start_game', { roomCode, language });
    };

    // ─── SABOTAGE INPUT ──────────────────────────────────────────────────────
    if (phase === 'sabotage_input' && myRole === 'saboteur') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6">
                <SabotageInputPhase roomCode={roomCode!} roundId={roundId} />
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

    // ─── NARRATION PHASE ─────────────────────────────────────────────────────
    if (phase === 'narration') {
        if (myRole === 'narrator') {
            return (
                <>
                    <NarratorView targetWord={targetWord || 'Loading...'} />
                    {/* Overlay event notifications */}
                    <AnimatePresence>
                        {gameEvent && (
                            <motion.div
                                key="event"
                                initial={{ y: -80, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -80, opacity: 0 }}
                                className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-2xl font-bold text-white text-center shadow-2xl border ${gameEvent.type === 'sabotage' ? 'bg-brand-pink/90 border-brand-pink' : gameEvent.type === 'correct_guess' ? 'bg-green-500/90 border-green-400' : 'bg-red-600/90 border-red-500'}`}
                            >
                                {gameEvent.message}
                            </motion.div>
                        )}
                        {hostCommentary && (
                            <motion.div
                                key="commentary"
                                initial={{ y: 80, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 80, opacity: 0 }}
                                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm px-8 py-4 rounded-2xl bg-black/80 border border-brand-cyan font-medium text-white text-center shadow-2xl"
                            >
                                🎙️ {hostCommentary}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            );
        }

        const handleYandi = () => {
            setShowYandiInput(true);
        };

        const submitYandi = () => {
            if (yandiWord.trim()) {
                socket?.emit('trigger_sabotage', { roomCode, roundId, word: yandiWord.trim() });
                setYandiWord('');
                setShowYandiInput(false);
            }
        };

        const handleGuess = (guessWord: string) => {
            socket?.emit('submit_guess', { roomCode, roundId, guessWord });
        };

        return (
            <>
                <PlayerActionView role={myRole as 'saboteur' | 'guesser'} onSabotage={handleYandi} onGuess={handleGuess} />

                {/* YANDI word input modal */}
                <AnimatePresence>
                    {showYandiInput && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
                            onClick={() => setShowYandiInput(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.85, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.85, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-[#0d0d1a] border border-brand-pink rounded-3xl p-8 w-full max-w-sm shadow-[0_0_40px_rgba(255,0,128,0.3)]"
                            >
                                <h2 className="text-2xl font-black text-brand-pink uppercase tracking-widest text-center mb-2">🔥 YANDI!</h2>
                                <p className="text-white/60 text-center text-sm mb-6">{t('whatWordSaid')}</p>
                                <Input
                                    autoFocus
                                    placeholder="Yasaklı kelime..."
                                    value={yandiWord}
                                    onChange={e => setYandiWord(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && submitYandi()}
                                    className="text-center font-bold mb-4"
                                />
                                <Button className="w-full" variant="danger" size="lg" onClick={submitYandi} disabled={!yandiWord.trim()}>
                                    YANDI! 🔥
                                </Button>
                            </motion.div>
                        </motion.div>
                    )}

                    {/* Event notifications */}
                    {gameEvent && (
                        <motion.div
                            key="event"
                            initial={{ y: -80, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -80, opacity: 0 }}
                            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-2xl font-bold text-white text-center shadow-2xl border ${gameEvent.type === 'sabotage' ? 'bg-brand-pink/90 border-brand-pink' : gameEvent.type === 'correct_guess' ? 'bg-green-500/90 border-green-400' : 'bg-red-600/90 border-red-500'}`}
                        >
                            {gameEvent.message}
                        </motion.div>
                    )}

                    {hostCommentary && (
                        <motion.div
                            key="commentary"
                            initial={{ y: 80, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm px-8 py-4 rounded-2xl bg-black/80 border border-brand-cyan font-medium text-white text-center shadow-2xl"
                        >
                            🎙️ {hostCommentary}
                        </motion.div>
                    )}
                </AnimatePresence>
            </>
        );
    }

    // ─── LOBBY ───────────────────────────────────────────────────────────────
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
                            {t('rulesText1')}
                        </p>
                        <p className="text-white/50 text-xs mt-2">
                            {t('rulesText2')}
                        </p>
                    </NeonCard>

                    {isHost ? (
                        <Button
                            size="xl"
                            className="w-full py-8 text-3xl"
                            onClick={handleStartGame}
                            disabled={players.length < 1}
                        >
                            {t('startGame')}
                        </Button>
                    ) : (
                        <NeonCard className="text-center py-6">
                            <p className="text-white/60 animate-pulse">{t('waitingHost')}</p>
                        </NeonCard>
                    )}
                </div>
            </div>
        </div>
    );
};
