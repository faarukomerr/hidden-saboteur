import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../lib/SocketContext';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SabotageInputPhase } from '../components/game/SabotageInputPhase';
import { useLanguage } from '../lib/i18n';
import { LanguageToggle } from '../components/ui/LanguageToggle';

interface Player { id: string; name: string; score: number; }
interface ScoreEntry { name: string; socketId: string; points: number; }

export const Lobby = () => {
    const { id: roomCode } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const username = searchParams.get('user');
    const isHost = searchParams.get('host') === 'true';

    // Core game state
    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<'lobby' | 'sabotage_input' | 'narration' | 'game_over'>('lobby');
    const [myRole, setMyRole] = useState<'narrator' | 'guesser' | 'saboteur' | null>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);
    const [roundId, setRoundId] = useState('');
    const { t, language } = useLanguage();

    // Timer
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [timerStarted, setTimerStarted] = useState(false);

    // Saboteur word buttons (received from server after saving)
    const [saboteurWords, setSaboteurWords] = useState<string[]>([]);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);

    // Guesser
    const [guessesLeft, setGuessesLeft] = useState(3);
    const [guessInput, setGuessInput] = useState('');

    // Event toasts
    const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);
    const [commentary, setCommentary] = useState<string | null>(null);

    // Scores
    const [scores, setScores] = useState<ScoreEntry[]>([]);

    // ── Full state reset ─────────────────────────────────────────────────
    const resetGameState = () => {
        setMyRole(null); setTargetWord(null); setRoundId('');
        setTimeLeft(0); setTimerStarted(false);
        setSaboteurWords([]); setSelectedWord(null);
        setGuessesLeft(3); setGuessInput('');
        setToast(null); setCommentary(null);
    };

    // ── Socket listeners ─────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !roomCode || !username) { navigate('/'); return; }
        if (isConnected) socket.emit('join_room', { roomCode, username });

        socket.on('room_state_update', (d: { players: Player[] }) => setPlayers(d.players || []));

        socket.on('role_assigned', (d: any) => {
            // New round: reset everything then set new role
            resetGameState();
            setMyRole(d.role);
            setTargetWord(d.targetWord || null);
            setRoundId(d.roundId || '');
        });

        socket.on('phase_changed', (d: { phase: any }) => setPhase(d.phase));

        // Saboteur's words arrive separately from server state
        socket.on('saboteur_words_list', (d: { words: string[] }) => setSaboteurWords(d.words));
        socket.on('sabotage_words_saved', (d: { words: string[] }) => setSaboteurWords(d.words || []));

        socket.on('timer_sync', (d: { timeLeft: number }) => {
            setTimeLeft(d.timeLeft);
            if (d.timeLeft > 0) setTimerStarted(true);
        });

        socket.on('scores_update', (d: { scores: ScoreEntry[] }) => setScores(d.scores));

        socket.on('sabotage_confirmed', (d: { word: string }) => {
            showToast('sabotage', `🔥 YANDI! "${d.word}" yakalandı!`, 4000);
        });
        socket.on('sabotage_failed', () => {
            showToast('wrong', '❌ Bu yasaklı kelimelerden biri değildi!', 3000);
        });
        socket.on('host_commentary', (d: { message: string }) => {
            setCommentary(d.message);
            setTimeout(() => setCommentary(null), 6000);
        });
        socket.on('guess_result', (d: { guessWord: string; guesserName: string }) => {
            showToast('wrong', `❌ ${d.guesserName}: "${d.guessWord}" yanlış`, 3000);
        });
        socket.on('round_complete', (d: { targetWord: string; winnerName?: string; reason?: string }) => {
            if (d.reason === 'timeout') {
                showToast('timeout', `⏱️ Süre doldu! Kelime "${d.targetWord}" idi.`, 4000);
            } else if (d.winnerName) {
                showToast('correct', `🎉 ${d.winnerName} doğru bildi! "${d.targetWord}"`, 4000);
            }
            setTimeout(() => { resetGameState(); setPhase('lobby'); }, 3500);
        });
        socket.on('game_over', () => setPhase('game_over'));
        socket.on('force_reset', () => resetGameState());

        return () => {
            ['room_state_update', 'role_assigned', 'phase_changed', 'saboteur_words_list',
                'sabotage_words_saved', 'timer_sync', 'scores_update', 'sabotage_confirmed',
                'sabotage_failed', 'host_commentary', 'guess_result', 'round_complete',
                'game_over', 'force_reset'
            ].forEach(e => socket.off(e));
        };
    }, [socket, isConnected, roomCode, username, navigate]);

    const showToast = (type: string, msg: string, ms: number) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), ms);
    };

    // ── Shared UI components ─────────────────────────────────────────────
    const TimerBar = () => {
        if (!timerStarted || timeLeft <= 0) return null;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const isUrgent = timeLeft <= 10;
        return (
            <motion.div initial={{ y: -60 }} animate={{ y: 0 }}
                className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center py-3 bg-gradient-to-b from-black/90 to-black/60 backdrop-blur-xl border-b border-white/10">
                <div className={`flex items-center gap-3 ${isUrgent ? 'animate-pulse' : ''}`}>
                    <span className="text-lg">⏱️</span>
                    <span className={`text-3xl font-black font-mono tracking-widest ${isUrgent ? 'text-brand-pink' : 'text-brand-cyan'}`}>
                        {mins}:{secs.toString().padStart(2, '0')}
                    </span>
                </div>
            </motion.div>
        );
    };

    const NavButtons = () => (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
            <button onClick={() => socket?.emit('return_to_lobby', { roomCode })}
                className="bg-white/5 hover:bg-white/15 text-white/50 hover:text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 backdrop-blur-sm transition-all hover:scale-105">
                🏠 Lobiye Dön
            </button>
            <button onClick={() => socket?.emit('restart_round', { roomCode })}
                className="bg-brand-pink/10 hover:bg-brand-pink/25 text-brand-pink px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-brand-pink/20 backdrop-blur-sm transition-all hover:scale-105">
                🔄 Yeniden Başlat
            </button>
        </div>
    );

    const Scoreboard = ({ mini = false }: { mini?: boolean }) => {
        if (scores.length === 0) return null;
        if (mini) {
            return (
                <div className="fixed top-14 right-4 z-50 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 space-y-1 max-w-[180px]">
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">🏆 Skor</p>
                    {scores.slice(0, 5).map((s, i) => (
                        <div key={i} className="flex justify-between text-xs">
                            <span className={`font-medium truncate mr-2 ${s.name === username ? 'text-brand-cyan' : 'text-white/70'}`}>{s.name}</span>
                            <span className="text-brand-cyan font-mono font-bold">{s.points}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const ToastOverlay = () => (
        <AnimatePresence>
            {toast && (
                <motion.div key="toast" initial={{ y: -80, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -80, opacity: 0, scale: 0.9 }}
                    className={`fixed top-20 left-1/2 -translate-x-1/2 z-[70] px-6 py-4 rounded-2xl font-bold text-white text-center shadow-2xl border max-w-sm backdrop-blur-md
                        ${toast.type === 'sabotage' ? 'bg-brand-pink/90 border-brand-pink shadow-brand-pink/30' :
                            toast.type === 'correct' || toast.type === 'timeout' ? 'bg-green-500/90 border-green-400 shadow-green-400/30' :
                                'bg-red-600/90 border-red-500 shadow-red-500/30'}`}>
                    {toast.msg}
                </motion.div>
            )}
            {commentary && (
                <motion.div key="comm" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] max-w-sm px-6 py-4 rounded-2xl bg-black/90 border border-brand-cyan/50 text-white text-center shadow-2xl backdrop-blur-md">
                    🎙️ {commentary}
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ══════════════════════════════════════════════════════════════════════
    // ─── GAME OVER ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    if (phase === 'game_over') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 relative">
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                    <div className="text-[120px] leading-none mb-4">🔥</div>
                    <h1 className="text-5xl md:text-6xl font-black text-brand-pink mb-3 tracking-tight">YANDI!</h1>
                    <p className="text-xl text-white/60 mb-8">Sabotajcı kazandı — Anlatıcı yasaklı kelimeyi söyledi!</p>

                    {scores.length > 0 && (
                        <NeonCard className="mb-8 max-w-sm mx-auto">
                            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-4">🏆 Final Skor Tablosu</p>
                            <div className="space-y-2">
                                {scores.map((s, i) => (
                                    <div key={i} className={`flex justify-between items-center px-4 py-2 rounded-xl ${i === 0 ? 'bg-brand-cyan/20 border border-brand-cyan/30' : 'bg-white/5'}`}>
                                        <span className="font-bold">{i === 0 ? '👑 ' : ''}{s.name}</span>
                                        <span className="text-brand-cyan font-mono font-bold text-lg">{s.points}</span>
                                    </div>
                                ))}
                            </div>
                        </NeonCard>
                    )}

                    <Button size="xl" onClick={() => navigate('/')} className="px-12 text-xl">🏠 Ana Menüye Dön</Button>
                </motion.div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ─── SABOTAGE INPUT ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
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
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }}>
                    <div className="text-6xl mb-4">🤫</div>
                    <NeonCard className="max-w-md">
                        <p className="text-xl text-brand-cyan font-bold tracking-widest uppercase mb-2 animate-pulse">{t('saboteursSettingTraps')}</p>
                        <p className="text-white/50">{t('getReady')}</p>
                        {myRole === 'narrator' && <p className="mt-3 text-brand-pink text-sm font-bold">Rolün: Anlatıcı. Hazır ol!</p>}
                        {myRole === 'guesser' && <p className="mt-3 text-brand-cyan text-sm font-bold">Rolün: Tahminci. Hazır ol!</p>}
                    </NeonCard>
                </motion.div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ─── NARRATION PHASE ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    if (phase === 'narration') {

        // ── NARRATOR: time selection → then show word ────────────────────
        if (myRole === 'narrator') {
            if (!timerStarted) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <div className="text-6xl mb-4">⏱️</div>
                            <h2 className="text-3xl font-black text-brand-cyan uppercase tracking-widest mb-3">Süre Seç</h2>
                            <p className="text-white/50 mb-8">Bu tur için ne kadar süren olsun?</p>
                            <div className="flex gap-3 flex-wrap justify-center">
                                {[{ label: '1 Dakika', sec: 60, variant: 'primary' as const },
                                { label: '1.5 Dakika', sec: 90, variant: 'secondary' as const },
                                { label: '2 Dakika', sec: 120, variant: 'danger' as const }
                                ].map(opt => (
                                    <Button key={opt.sec} size="xl" variant={opt.variant} className="px-8 py-5 text-lg"
                                        onClick={() => socket?.emit('set_timer', { roomCode, durationSeconds: opt.sec })}>
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                        </motion.div>
                        <NavButtons />
                    </div>
                );
            }

            return (
                <>
                    <TimerBar />
                    <Scoreboard mini />
                    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 pt-20">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                            <p className="text-lg text-brand-cyan font-bold uppercase tracking-[0.3em] mb-4 animate-pulse">Sen Anlatıcısın</p>
                            <NeonCard className="py-10 px-8 mb-6">
                                <p className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4">🎯 Hedef Kelime</p>
                                <h1 className="text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]">
                                    {targetWord}
                                </h1>
                            </NeonCard>
                            <div className="bg-brand-pink/20 border border-brand-pink border-dashed rounded-2xl p-5 max-w-md mx-auto">
                                <p className="text-brand-pink font-bold text-sm uppercase tracking-widest mb-1">⚠️ Uyarı</p>
                                <p className="text-white/70 text-sm">Kelimeyi anlat ama yasaklı kelimeleri söyleme!</p>
                            </div>
                        </motion.div>
                    </div>
                    <NavButtons />
                    <ToastOverlay />
                </>
            );
        }

        // ── SABOTEUR: word buttons + YANDI ───────────────────────────────
        if (myRole === 'saboteur') {
            return (
                <>
                    <TimerBar />
                    <Scoreboard mini />
                    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center p-6 pt-20">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <div className="text-5xl mb-3">🕵️</div>
                            <h2 className="text-2xl font-black text-brand-pink uppercase tracking-widest mb-2">Sabotajcı Modu</h2>
                            <p className="text-white/50 text-sm mb-2">Hedef: <span className="text-brand-pink font-bold">{targetWord}</span></p>
                            <p className="text-white/40 text-xs mb-6">Anlatıcı aşağıdaki kelimelerden birini söylerse tıklayıp YANDI! de</p>

                            <div className="flex flex-wrap gap-3 justify-center mb-6 max-w-md">
                                {saboteurWords.length > 0 ? saboteurWords.map((w, i) => (
                                    <motion.button key={i} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setSelectedWord(w === selectedWord ? null : w)}
                                        className={`px-6 py-3.5 rounded-2xl font-bold text-lg border-2 transition-all duration-200
                                            ${selectedWord === w
                                                ? 'bg-brand-pink text-white border-brand-pink shadow-[0_0_25px_rgba(255,0,128,0.5)] scale-105'
                                                : 'bg-brand-pink/10 text-brand-pink border-brand-pink/30 hover:bg-brand-pink/20 hover:border-brand-pink/60'}`}>
                                        {w}
                                    </motion.button>
                                )) : (
                                    <p className="text-white/40 italic">Kelimeler yükleniyor...</p>
                                )}
                            </div>

                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button variant="danger" size="xl" className="px-14 py-5 text-2xl shadow-[0_0_30px_rgba(255,0,128,0.4)]"
                                    disabled={!selectedWord}
                                    onClick={() => {
                                        if (selectedWord) {
                                            socket?.emit('trigger_sabotage', { roomCode, roundId, word: selectedWord });
                                            setSelectedWord(null);
                                        }
                                    }}>
                                    🔥 YANDI!
                                </Button>
                            </motion.div>
                        </motion.div>
                    </div>
                    <NavButtons />
                    <ToastOverlay />
                </>
            );
        }

        // ── GUESSER ──────────────────────────────────────────────────────
        return (
            <>
                <TimerBar />
                <Scoreboard mini />
                <div className="flex flex-col items-center justify-center min-h-[85vh] text-center p-6 pt-20 w-full max-w-md mx-auto">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full">
                        <div className="text-5xl mb-3">🔍</div>
                        <h2 className="text-2xl font-black text-brand-cyan uppercase tracking-widest mb-3">Tahminci</h2>
                        <p className="text-white/50 text-sm mb-2">Anlatıcıyı dinle ve hedef kelimeyi tahmin et!</p>

                        <div className="flex items-center justify-center gap-2 mb-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className={`w-4 h-4 rounded-full transition-all ${i <= guessesLeft ? 'bg-brand-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]' : 'bg-white/20'}`} />
                            ))}
                            <span className="text-white/50 text-sm ml-2">{guessesLeft}/3 hak</span>
                        </div>

                        {guessesLeft > 0 ? (
                            <NeonCard className="w-full">
                                <div className="flex gap-2">
                                    <Input placeholder="Tahminini yaz..." value={guessInput}
                                        onChange={e => setGuessInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && guessInput.trim()) {
                                                socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                                setGuessInput(''); setGuessesLeft(p => p - 1);
                                            }
                                        }} />
                                    <Button onClick={() => {
                                        if (guessInput.trim()) {
                                            socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                            setGuessInput(''); setGuessesLeft(p => p - 1);
                                        }
                                    }} disabled={!guessInput.trim()}>
                                        Tahmin Et
                                    </Button>
                                </div>
                            </NeonCard>
                        ) : (
                            <NeonCard variant="danger" className="w-full">
                                <div className="text-4xl mb-2">😵</div>
                                <p className="text-brand-pink font-bold text-lg">Tahmin hakkın bitti!</p>
                                <p className="text-white/40 text-sm mt-1">Sonuçları bekle...</p>
                            </NeonCard>
                        )}
                    </motion.div>
                </div>
                <NavButtons />
                <ToastOverlay />
            </>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ─── LOBBY ───────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    return (
        <div className="flex flex-col items-center min-h-screen p-6 pt-16 relative">
            <LanguageToggle />

            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
                <p className="text-white/40 uppercase tracking-[0.4em] font-bold text-xs mb-2">{t('roomCode')}</p>
                <h1 className="text-6xl md:text-8xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-brand-cyan via-blue-400 to-purple-500 drop-shadow-[0_0_30px_rgba(0,240,255,0.3)]">
                    {roomCode}
                </h1>
            </motion.div>

            <div className="w-full max-w-2xl grid gap-5 md:grid-cols-2">
                {/* Players + Scores */}
                <NeonCard>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-xl font-bold uppercase tracking-wider">{t('players')}</h2>
                        <span className="bg-brand-cyan/20 text-brand-cyan px-3 py-1 rounded-full text-xs font-bold">{players.length}/8</span>
                    </div>
                    <div className="space-y-2">
                        <AnimatePresence>
                            {players.map((p, idx) => {
                                const sc = scores.find(s => s.name === p.name);
                                return (
                                    <motion.div key={p.name + idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                        className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl px-4 py-3 hover:border-brand-cyan/30 transition-colors">
                                        <span className="font-semibold">
                                            {p.name}
                                            {p.name === username && <span className="text-brand-cyan ml-1.5 text-xs"> {t('you')}</span>}
                                        </span>
                                        <span className="text-brand-cyan font-mono font-bold text-sm">{sc ? sc.points : 0} pt</span>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {players.length === 0 && <p className="p-6 text-center text-white/30 italic text-sm">{t('waitingPlayers')}</p>}
                    </div>
                </NeonCard>

                <div className="flex flex-col gap-5">
                    <NeonCard variant="secondary" className="flex-grow flex flex-col justify-center text-center">
                        <h3 className="text-lg font-bold mb-2">{t('rulesTitle')}</h3>
                        <p className="text-white/60 text-sm leading-relaxed">{t('rulesText1')}</p>
                        <p className="text-white/40 text-xs mt-2 leading-relaxed">{t('rulesText2')}</p>
                    </NeonCard>

                    {isHost ? (
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button size="xl" className="w-full py-7 text-2xl shadow-[0_0_30px_rgba(0,240,255,0.3)]"
                                onClick={() => {
                                    if (players.length < 1) { alert(t('needPlayersAlert')); return; }
                                    socket?.emit('start_game', { roomCode, language });
                                }}
                                disabled={players.length < 1}>
                                🎮 {t('startGame')}
                            </Button>
                        </motion.div>
                    ) : (
                        <NeonCard className="text-center py-5">
                            <p className="text-white/50 animate-pulse text-sm">{t('waitingHost')}</p>
                        </NeonCard>
                    )}
                </div>
            </div>

            <ToastOverlay />
        </div>
    );
};
