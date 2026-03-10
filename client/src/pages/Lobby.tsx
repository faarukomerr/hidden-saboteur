import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../lib/SocketContext';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SabotageInputPhase } from '../components/game/SabotageInputPhase';
import { NarratorView } from '../components/game/NarratorView';
import { useLanguage } from '../lib/i18n';
import { LanguageToggle } from '../components/ui/LanguageToggle';

interface Player { id: string; name: string; score: number; }

export const Lobby = () => {
    const { id: roomCode } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const username = searchParams.get('user');
    const isHost = searchParams.get('host') === 'true';

    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<'lobby' | 'sabotage_input' | 'narration' | 'timer_select' | 'game_over'>('lobby');
    const { t, language } = useLanguage();

    // Role state
    const [myRole, setMyRole] = useState<'narrator' | 'guesser' | 'saboteur' | null>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);
    const [roundId, setRoundId] = useState<string>('');

    // Timer
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    // Saboteur word list (for narration phase — clickable buttons)
    const [mySabotageWords, setMySabotageWords] = useState<string[]>([]);
    const [selectedYandiWord, setSelectedYandiWord] = useState<string | null>(null);

    // Guesser state
    const [guessesLeft, setGuessesLeft] = useState(3);
    const [guessInput, setGuessInput] = useState('');

    // Event feedback
    const [gameEvent, setGameEvent] = useState<{ type: string, message: string } | null>(null);
    const [hostCommentary, setHostCommentary] = useState<string | null>(null);

    useEffect(() => {
        if (!socket || !roomCode || !username) { navigate('/'); return; }
        if (isConnected) socket.emit('join_room', { roomCode, username });

        socket.on('room_state_update', (data: { players: Player[] }) => {
            if (data.players) setPlayers(data.players);
        });

        socket.on('role_assigned', (data: any) => {
            setMyRole(data.role);
            setTargetWord(data.targetWord || null);
            setRoundId(data.roundId || '');
            setGuessesLeft(3);
            setMySabotageWords([]);
            setSelectedYandiWord(null);
            setGuessInput('');
            setGameEvent(null);
        });

        socket.on('phase_changed', (data: { phase: any }) => setPhase(data.phase));

        socket.on('sabotage_words_saved', (data: { words: string[] }) => {
            setMySabotageWords(data.words || []);
        });

        socket.on('timer_sync', (data: { timeLeft: number }) => setTimeLeft(data.timeLeft));
        socket.on('timer_started', () => { /* timer_sync handles display */ });

        socket.on('sabotage_confirmed', (data: { word: string }) => {
            setGameEvent({ type: 'sabotage', message: `🔥 YANDI! "${data.word}" yakalandı!` });
            setTimeout(() => setGameEvent(null), 4000);
        });

        socket.on('sabotage_failed', () => {
            setGameEvent({ type: 'wrong', message: `❌ Bu yasaklı kelimelerden biri değildi!` });
            setTimeout(() => setGameEvent(null), 3000);
        });

        socket.on('host_commentary', (data: { message: string }) => {
            setHostCommentary(data.message);
            setTimeout(() => setHostCommentary(null), 6000);
        });

        socket.on('guess_result', (data: { correct: boolean, guessWord: string, guesserName: string }) => {
            setGameEvent({ type: 'wrong', message: `❌ ${data.guesserName}: "${data.guessWord}" yanlış!` });
            setTimeout(() => setGameEvent(null), 3000);
        });

        socket.on('round_complete', (data: { targetWord: string, winnerName?: string }) => {
            const winner = data.winnerName || '';
            const msg = winner
                ? `🎉 ${winner} doğru bildi! Kelime "${data.targetWord}" idi! Yeni tur başlıyor...`
                : `⏱️ ${data.targetWord}`;
            setGameEvent({ type: 'correct', message: msg });
            setTimeLeft(null);
            setTimeout(() => {
                setMyRole(null); setTargetWord(null); setPhase('lobby');
                setGameEvent(null); setGuessesLeft(3); setMySabotageWords([]);
            }, 4000);
        });

        socket.on('game_over', (data: { reason: string, word?: string }) => {
            setTimeLeft(null);
            setPhase('game_over');
        });

        return () => {
            ['room_state_update', 'role_assigned', 'phase_changed', 'sabotage_words_saved',
                'timer_sync', 'timer_started', 'sabotage_confirmed', 'sabotage_failed',
                'host_commentary', 'guess_result', 'round_complete', 'game_over'
            ].forEach(e => socket.off(e));
        };
    }, [socket, isConnected, roomCode, username, navigate]);

    // ─── Common UI: Timer bar ────────────────────────────────────────────
    const TimerBar = () => {
        if (timeLeft === null || timeLeft <= 0) return null;
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-3 bg-black/80 backdrop-blur-md border-b border-white/10"
            >
                <span className={`text-2xl font-black font-mono ${timeLeft <= 10 ? 'text-brand-pink animate-pulse' : 'text-brand-cyan'}`}>
                    ⏱️ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </span>
            </motion.div>
        );
    };

    // ─── Common UI: Navigation buttons ───────────────────────────────────
    const GameNavButtons = () => (
        <div className="fixed bottom-4 right-4 z-40 flex gap-2">
            <button onClick={() => { socket?.emit('return_to_lobby', { roomCode }); }}
                className="bg-white/10 hover:bg-white/20 text-white/60 hover:text-white px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 transition-colors">
                🏠 Lobiye Dön
            </button>
            <button onClick={() => { socket?.emit('restart_round', { roomCode }); }}
                className="bg-brand-pink/20 hover:bg-brand-pink/30 text-brand-pink px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-brand-pink/30 transition-colors">
                🔄 Yeniden Başlat
            </button>
        </div>
    );

    // ─── Event toast overlay ─────────────────────────────────────────────
    const EventOverlay = () => (
        <AnimatePresence>
            {gameEvent && (
                <motion.div key="event" initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
                    className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl font-bold text-white text-center shadow-2xl border max-w-sm
                        ${gameEvent.type === 'sabotage' ? 'bg-brand-pink/90 border-brand-pink' : gameEvent.type === 'correct' ? 'bg-green-500/90 border-green-400' : 'bg-red-600/90 border-red-500'}`}
                >
                    {gameEvent.message}
                </motion.div>
            )}
            {hostCommentary && (
                <motion.div key="commentary" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                    className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm px-6 py-3 rounded-2xl bg-black/80 border border-brand-cyan text-white text-center shadow-2xl">
                    🎙️ {hostCommentary}
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ─── GAME OVER ───────────────────────────────────────────────────────
    if (phase === 'game_over') {
        return (
            <motion.div key="gameover" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center min-h-screen text-center p-6">
                <div className="text-8xl mb-6">🔥</div>
                <h1 className="text-4xl md:text-5xl font-black text-brand-pink mb-2">YANDI! SABOTAJCI KAZANDI!</h1>
                <p className="text-white/60 text-lg mb-10">Anlatıcı yasaklı kelimeyi söyledi!</p>
                <Button size="xl" onClick={() => navigate('/')} className="px-12">🏠 Ana Menüye Dön</Button>
            </motion.div>
        );
    }

    // ─── SABOTAGE INPUT ──────────────────────────────────────────────────
    if (phase === 'sabotage_input' && myRole === 'saboteur') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6">
                <SabotageInputPhase roomCode={roomCode!} roundId={roundId} targetWord={targetWord || '?'} />
            </div>
        );
    }

    if (phase === 'sabotage_input' && myRole !== 'saboteur') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <NeonCard className="max-w-md">
                    <p className="text-xl text-brand-cyan font-bold tracking-widest uppercase mb-4 animate-pulse">{t('saboteursSettingTraps')}</p>
                    <p className="text-white/60">{t('getReady')}</p>
                </NeonCard>
            </div>
        );
    }

    // ─── NARRATION PHASE ─────────────────────────────────────────────────
    if (phase === 'narration') {
        // ── Narrator: pick timer then show word ──
        if (myRole === 'narrator') {
            // Timer selection is the first thing the narrator does
            if (timeLeft === null) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                        <h2 className="text-3xl font-black text-brand-cyan uppercase tracking-widest mb-8">⏱️ Süre Seç</h2>
                        <p className="text-white/60 mb-6">Anlatım için ne kadar süre istiyorsun?</p>
                        <div className="flex gap-4">
                            <Button size="xl" className="px-12 py-6 text-2xl" onClick={() => socket?.emit('set_timer', { roomCode, durationSeconds: 60 })}>
                                1 Dakika
                            </Button>
                            <Button size="xl" variant="secondary" className="px-12 py-6 text-2xl" onClick={() => socket?.emit('set_timer', { roomCode, durationSeconds: 90 })}>
                                1.5 Dakika
                            </Button>
                            <Button size="xl" variant="danger" className="px-12 py-6 text-2xl" onClick={() => socket?.emit('set_timer', { roomCode, durationSeconds: 120 })}>
                                2 Dakika
                            </Button>
                        </div>
                        <GameNavButtons />
                    </div>
                );
            }

            return (
                <>
                    <TimerBar />
                    <NarratorView targetWord={targetWord || 'Loading...'} />
                    <GameNavButtons />
                    <EventOverlay />
                </>
            );
        }

        // ── Saboteur during narration: show their words as clickable buttons ──
        if (myRole === 'saboteur') {
            return (
                <>
                    <TimerBar />
                    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-6 pt-20">
                        <h2 className="text-2xl text-brand-pink font-bold uppercase tracking-[0.3em] mb-6">🤫 Sabotajcı Modu</h2>
                        <p className="text-white/60 mb-2">Anlatıcı şu yasaklı kelimelerden birini söylerse tıkla!</p>
                        <p className="text-xs text-white/40 mb-8">Hedef kelime: <span className="text-brand-pink font-bold">{targetWord}</span></p>

                        <div className="flex flex-wrap gap-3 justify-center mb-8 max-w-md">
                            {mySabotageWords.map((w, i) => (
                                <button key={i}
                                    onClick={() => setSelectedYandiWord(w === selectedYandiWord ? null : w)}
                                    className={`px-6 py-3 rounded-2xl font-bold text-lg uppercase tracking-wider border-2 transition-all
                                        ${selectedYandiWord === w
                                            ? 'bg-brand-pink text-white border-brand-pink shadow-[0_0_20px_rgba(255,0,128,0.5)] scale-105'
                                            : 'bg-brand-pink/20 text-brand-pink border-brand-pink/40 hover:bg-brand-pink/30'}`}
                                >
                                    {w}
                                </button>
                            ))}
                        </div>

                        <Button variant="danger" size="xl" className="px-16 py-6 text-3xl"
                            disabled={!selectedYandiWord}
                            onClick={() => {
                                if (selectedYandiWord) {
                                    socket?.emit('trigger_sabotage', { roomCode, roundId, word: selectedYandiWord });
                                    setSelectedYandiWord(null);
                                }
                            }}
                        >
                            🔥 YANDI!
                        </Button>
                    </div>
                    <GameNavButtons />
                    <EventOverlay />
                </>
            );
        }

        // ── Guesser during narration ──
        return (
            <>
                <TimerBar />
                <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-6 pt-20 w-full max-w-md mx-auto">
                    <h2 className="text-2xl text-brand-cyan font-bold uppercase tracking-[0.3em] mb-4">{t('youAreGuesser')}</h2>
                    <p className="text-white/60 mb-2">{t('listenAndGuess')}</p>
                    <p className="text-brand-cyan font-bold mb-8">Kalan tahmin: {guessesLeft}/3</p>

                    {guessesLeft > 0 ? (
                        <NeonCard variant="secondary" className="w-full">
                            <div className="flex gap-2">
                                <Input
                                    placeholder={t('typeGuess')}
                                    value={guessInput}
                                    onChange={e => setGuessInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && guessInput.trim()) {
                                            socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                            setGuessInput('');
                                            setGuessesLeft(prev => prev - 1);
                                        }
                                    }}
                                />
                                <Button onClick={() => {
                                    if (guessInput.trim()) {
                                        socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                        setGuessInput('');
                                        setGuessesLeft(prev => prev - 1);
                                    }
                                }} disabled={!guessInput.trim()}>
                                    {t('guessBtn')}
                                </Button>
                            </div>
                        </NeonCard>
                    ) : (
                        <NeonCard variant="danger" className="w-full">
                            <p className="text-brand-pink font-bold text-xl">Tahmin hakkın bitti! 😵</p>
                            <p className="text-white/50 text-sm mt-2">Sonuçları bekle...</p>
                        </NeonCard>
                    )}
                </div>
                <GameNavButtons />
                <EventOverlay />
            </>
        );
    }

    // ─── LOBBY ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col items-center min-h-screen p-6 pt-20 relative">
            <LanguageToggle />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center mb-12">
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
                                <motion.div key={p.name + idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                    className="flex items-center justify-between bg-black/50 border border-white/5 rounded-xl p-4">
                                    <span className="font-semibold text-lg">{p.name} {p.name === username && t('you')}</span>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {players.length === 0 && <div className="p-8 text-center text-white/40 italic">{t('waitingPlayers')}</div>}
                    </div>
                </NeonCard>

                <div className="flex flex-col gap-6">
                    <NeonCard variant="secondary" className="flex-grow flex flex-col justify-center text-center">
                        <h3 className="text-xl font-bold mb-2">{t('rulesTitle')}</h3>
                        <p className="text-white/70 text-sm">{t('rulesText1')}</p>
                        <p className="text-white/50 text-xs mt-2">{t('rulesText2')}</p>
                    </NeonCard>

                    {isHost ? (
                        <Button size="xl" className="w-full py-8 text-3xl" onClick={() => {
                            if (players.length < 1) { alert(t('needPlayersAlert')); return; }
                            socket?.emit('start_game', { roomCode, language });
                        }} disabled={players.length < 1}>
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
