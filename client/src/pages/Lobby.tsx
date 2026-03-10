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

    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<'lobby' | 'sabotage_input' | 'narration' | 'round_summary' | 'game_over'>('lobby');
    const [myRole, setMyRole] = useState<'narrator' | 'guesser' | 'saboteur' | null>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);
    const [roundId, setRoundId] = useState('');
    const { t, language } = useLanguage();

    // Timer — server is source of truth
    const [timeLeft, setTimeLeft] = useState(0);
    const [timerStarted, setTimerStarted] = useState(false);

    // Saboteur clickable words
    const [saboteurWords, setSaboteurWords] = useState<string[]>([]);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);

    // Guesser
    const [guessesLeft, setGuessesLeft] = useState(3);
    const [guessInput, setGuessInput] = useState('');

    // Events
    const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);
    const [commentary, setCommentary] = useState<string | null>(null);

    // Scores — persist until new game
    const [scores, setScores] = useState<ScoreEntry[]>([]);

    // Round summary data
    const [summaryData, setSummaryData] = useState<{ targetWord: string; winnerName: string; reason: string } | null>(null);

    const resetRoundState = () => {
        setMyRole(null); setTargetWord(null); setRoundId('');
        setTimeLeft(0); setTimerStarted(false);
        setSaboteurWords([]); setSelectedWord(null);
        setGuessesLeft(3); setGuessInput('');
        setToast(null); setCommentary(null);
        // NOTE: scores are NOT reset here — they persist
    };

    useEffect(() => {
        if (!socket || !roomCode || !username) { navigate('/'); return; }
        if (isConnected) socket.emit('join_room', { roomCode, username });

        socket.on('room_state_update', (d: { players: Player[] }) => setPlayers(d.players || []));

        socket.on('role_assigned', (d: any) => {
            resetRoundState();
            setMyRole(d.role);
            setTargetWord(d.targetWord || null);
            setRoundId(d.roundId || '');
        });

        socket.on('phase_changed', (d: { phase: any }) => setPhase(d.phase));

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

        // Round ended (correct guess or timeout) → show summary with Next Round button
        socket.on('round_summary', (d: { targetWord: string; winnerName: string; reason: string }) => {
            setSummaryData(d);
            setPhase('round_summary');
            setTimeLeft(0); setTimerStarted(false);
        });

        socket.on('game_over', () => { setPhase('game_over'); setTimeLeft(0); setTimerStarted(false); });
        socket.on('force_reset', () => resetRoundState());

        return () => {
            ['room_state_update', 'role_assigned', 'phase_changed', 'saboteur_words_list',
                'sabotage_words_saved', 'timer_sync', 'scores_update', 'sabotage_confirmed',
                'sabotage_failed', 'host_commentary', 'guess_result', 'round_summary',
                'game_over', 'force_reset'
            ].forEach(e => socket.off(e));
        };
    }, [socket, isConnected, roomCode, username, navigate]);

    const showToast = (type: string, msg: string, ms: number) => {
        setToast({ type, msg }); setTimeout(() => setToast(null), ms);
    };

    // ── Shared Components ────────────────────────────────────────────────
    const TimerBar = () => {
        if (!timerStarted || timeLeft <= 0) return null;
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        const urgent = timeLeft <= 10;
        return (
            <div className={`fixed top-0 left-0 right-0 z-[60] flex items-center justify-center py-3 bg-black/90 backdrop-blur-xl border-b border-white/10 ${urgent ? 'border-brand-pink/50' : ''}`}>
                <div className={`flex items-center gap-3 ${urgent ? 'animate-pulse' : ''}`}>
                    <span className="text-lg">⏱️</span>
                    <span className={`text-3xl font-black font-mono tracking-[0.2em] ${urgent ? 'text-brand-pink' : 'text-brand-cyan'}`}>
                        {m}:{s.toString().padStart(2, '0')}
                    </span>
                </div>
            </div>
        );
    };

    const NavButtons = () => (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
            <button onClick={() => socket?.emit('return_to_lobby', { roomCode })}
                className="bg-white/5 hover:bg-white/15 text-white/50 hover:text-white px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-white/10 backdrop-blur-sm transition-all hover:scale-105">
                🏠 Lobiye Dön
            </button>
            <button onClick={() => socket?.emit('restart_round', { roomCode })}
                className="bg-brand-pink/10 hover:bg-brand-pink/25 text-brand-pink px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-brand-pink/20 backdrop-blur-sm transition-all hover:scale-105">
                🔄 Yeniden Başlat
            </button>
        </div>
    );

    const MiniScoreboard = () => {
        if (scores.length === 0) return null;
        return (
            <div className="fixed top-14 right-3 z-50 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 space-y-1 min-w-[150px] shadow-2xl">
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1">🏆 Skor</p>
                {scores.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex justify-between text-xs gap-3">
                        <span className={`font-medium truncate ${s.name === username ? 'text-brand-cyan' : 'text-white/60'}`}>
                            {i === 0 && '👑 '}{s.name}
                        </span>
                        <span className="text-brand-cyan font-mono font-bold">{s.points}</span>
                    </div>
                ))}
            </div>
        );
    };

    const ToastOverlay = () => (
        <AnimatePresence>
            {toast && (
                <motion.div key="toast" initial={{ y: -80, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -80, opacity: 0, scale: 0.9 }}
                    className={`fixed top-20 left-1/2 -translate-x-1/2 z-[70] px-6 py-4 rounded-2xl font-bold text-white text-center shadow-2xl border max-w-sm backdrop-blur-md
                        ${toast.type === 'sabotage' ? 'bg-brand-pink/90 border-brand-pink' :
                            toast.type === 'correct' ? 'bg-green-500/90 border-green-400' :
                                'bg-red-600/90 border-red-500'}`}>
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
    // ─── ROUND SUMMARY ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    if (phase === 'round_summary' && summaryData) {
        const isTimeout = summaryData.reason === 'timeout';
        const isGuess = summaryData.reason === 'guess';
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-6">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                    <div className="text-[100px] leading-none mb-4">{isGuess ? '🎉' : '⏱️'}</div>
                    <h1 className="text-4xl md:text-5xl font-black mb-3">
                        {isGuess ? (
                            <span className="text-green-400">{summaryData.winnerName} Doğru Bildi!</span>
                        ) : (
                            <span className="text-brand-cyan">Süre Doldu!</span>
                        )}
                    </h1>
                    <p className="text-white/50 text-xl mb-8">
                        Kelime: <span className="text-brand-pink font-bold">{summaryData.targetWord}</span>
                    </p>

                    {/* Inline scoreboard */}
                    {scores.length > 0 && (
                        <NeonCard className="mb-8 max-w-sm mx-auto">
                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-3">🏆 Skor Tablosu</p>
                            <div className="space-y-2">
                                {scores.map((s, i) => (
                                    <div key={i} className={`flex justify-between items-center px-4 py-2.5 rounded-xl transition-colors
                                        ${i === 0 ? 'bg-brand-cyan/15 border border-brand-cyan/20' :
                                            s.name === username ? 'bg-white/5 border border-brand-cyan/10' : 'bg-white/[0.03]'}`}>
                                        <span className="font-bold text-sm">{i === 0 ? '👑 ' : `${i + 1}. `}{s.name}</span>
                                        <span className="text-brand-cyan font-mono font-bold">{s.points} pt</span>
                                    </div>
                                ))}
                            </div>
                        </NeonCard>
                    )}

                    <div className="flex gap-3 flex-wrap justify-center">
                        {isHost && (
                            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                                <Button size="xl" className="px-12 py-5 text-xl shadow-[0_0_30px_rgba(0,240,255,0.3)]"
                                    onClick={() => socket?.emit('next_round', { roomCode })}>
                                    ▶️ Sonraki Tur
                                </Button>
                            </motion.div>
                        )}
                        <Button size="xl" variant="secondary" className="px-8 py-5 text-lg"
                            onClick={() => socket?.emit('return_to_lobby', { roomCode })}>
                            🏠 Lobiye Dön
                        </Button>
                    </div>
                    {!isHost && <p className="text-white/30 text-sm mt-4 animate-pulse">Kurucunun sonraki turu başlatmasını bekleyin...</p>}
                </motion.div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ─── GAME OVER ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    if (phase === 'game_over') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-6">
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                    <div className="text-[120px] leading-none mb-4">🔥</div>
                    <h1 className="text-5xl md:text-6xl font-black text-brand-pink mb-3">YANDI!</h1>
                    <p className="text-xl text-white/50 mb-8">Sabotajcı kazandı — Anlatıcı yasaklı kelimeyi söyledi!</p>

                    {scores.length > 0 && (
                        <NeonCard className="mb-8 max-w-sm mx-auto">
                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-3">🏆 Final Skor</p>
                            <div className="space-y-2">
                                {scores.map((s, i) => (
                                    <div key={i} className={`flex justify-between items-center px-4 py-2.5 rounded-xl ${i === 0 ? 'bg-brand-cyan/15 border border-brand-cyan/20' : 'bg-white/[0.03]'}`}>
                                        <span className="font-bold text-sm">{i === 0 ? '👑 ' : `${i + 1}. `}{s.name}</span>
                                        <span className="text-brand-cyan font-mono font-bold">{s.points} pt</span>
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
    if (phase === 'sabotage_input') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    <div className="text-6xl mb-4">🤫</div>
                    <NeonCard className="max-w-md">
                        <p className="text-xl text-brand-cyan font-bold tracking-widest uppercase mb-2 animate-pulse">{t('saboteursSettingTraps')}</p>
                        <p className="text-white/50">{t('getReady')}</p>
                        {myRole === 'narrator' && <p className="mt-3 text-brand-pink text-sm font-bold">Rolün: 📢 Anlatıcı</p>}
                        {myRole === 'guesser' && <p className="mt-3 text-brand-cyan text-sm font-bold">Rolün: 🔍 Tahminci</p>}
                    </NeonCard>
                </motion.div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ─── NARRATION ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    if (phase === 'narration') {
        // ── Narrator: timer select then describe ─────────────────────────
        if (myRole === 'narrator') {
            if (!timerStarted) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <div className="text-6xl mb-4">⏱️</div>
                            <h2 className="text-3xl font-black text-brand-cyan uppercase tracking-widest mb-2">Süre Seç</h2>
                            <p className="text-white/40 text-sm mb-8">Bu tur için ne kadar süren olsun?</p>
                            <div className="flex gap-3 flex-wrap justify-center">
                                {[{ l: '1 dk', s: 60 }, { l: '1.5 dk', s: 90 }, { l: '2 dk', s: 120 }].map(opt => (
                                    <motion.div key={opt.s} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                        <Button size="xl" className="px-10 py-5 text-xl"
                                            onClick={() => socket?.emit('set_timer', { roomCode, durationSeconds: opt.s })}>
                                            {opt.l}
                                        </Button>
                                    </motion.div>
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
                    <MiniScoreboard />
                    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 pt-16">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <p className="text-base text-brand-cyan font-bold uppercase tracking-[0.3em] mb-4">📢 Sen Anlatıcısın</p>
                            <NeonCard className="py-10 px-8 mb-6">
                                <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">🎯 Hedef Kelime</p>
                                <h1 className="text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60">
                                    {targetWord}
                                </h1>
                            </NeonCard>
                            <div className="bg-brand-pink/15 border border-brand-pink/30 border-dashed rounded-2xl p-5 max-w-md mx-auto">
                                <p className="text-brand-pink font-bold text-xs uppercase tracking-widest mb-1">⚠️ Uyarı</p>
                                <p className="text-white/60 text-sm">Kelimeyi anlat ama yasaklı kelimeleri söyleme!</p>
                            </div>
                        </motion.div>
                    </div>
                    <NavButtons />
                    <ToastOverlay />
                </>
            );
        }

        // ── Saboteur: word buttons ───────────────────────────────────────
        if (myRole === 'saboteur') {
            return (
                <>
                    <TimerBar />
                    <MiniScoreboard />
                    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center p-6 pt-20">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <div className="text-5xl mb-3">🕵️</div>
                            <h2 className="text-2xl font-black text-brand-pink uppercase tracking-widest mb-2">Sabotajcı</h2>
                            <p className="text-white/40 text-xs mb-1">Hedef: <span className="text-brand-pink font-bold">{targetWord}</span></p>
                            <p className="text-white/30 text-xs mb-6">Anlatıcı yasaklı kelimelerden birini söylerse tıklayıp YANDI de!</p>

                            <div className="flex flex-wrap gap-3 justify-center mb-6 max-w-md">
                                {saboteurWords.length > 0 ? saboteurWords.map((w, i) => (
                                    <motion.button key={i} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setSelectedWord(w === selectedWord ? null : w)}
                                        className={`px-6 py-3.5 rounded-2xl font-bold text-lg border-2 transition-all duration-200
                                            ${selectedWord === w
                                                ? 'bg-brand-pink text-white border-brand-pink shadow-[0_0_25px_rgba(255,0,128,0.5)] scale-105'
                                                : 'bg-brand-pink/10 text-brand-pink border-brand-pink/30 hover:bg-brand-pink/20'}`}>
                                        {w}
                                    </motion.button>
                                )) : (
                                    <p className="text-white/30 italic text-sm">Kelimeler yükleniyor...</p>
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

        // ── Guesser ──────────────────────────────────────────────────────
        return (
            <>
                <TimerBar />
                <MiniScoreboard />
                <div className="flex flex-col items-center justify-center min-h-[85vh] text-center p-6 pt-20 w-full max-w-md mx-auto">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full">
                        <div className="text-5xl mb-3">🔍</div>
                        <h2 className="text-2xl font-black text-brand-cyan uppercase tracking-widest mb-3">Tahminci</h2>
                        <p className="text-white/40 text-sm mb-2">Anlatıcıyı dinle ve hedef kelimeyi tahmin et!</p>

                        <div className="flex items-center justify-center gap-2 mb-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${i <= guessesLeft ? 'bg-brand-cyan shadow-[0_0_8px_rgba(0,240,255,0.5)]' : 'bg-white/15'}`} />
                            ))}
                            <span className="text-white/40 text-xs ml-2">{guessesLeft}/3 hak</span>
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
                                    <Button disabled={!guessInput.trim()} onClick={() => {
                                        if (guessInput.trim()) {
                                            socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                            setGuessInput(''); setGuessesLeft(p => p - 1);
                                        }
                                    }}>Tahmin Et</Button>
                                </div>
                            </NeonCard>
                        ) : (
                            <NeonCard variant="danger" className="w-full">
                                <div className="text-4xl mb-2">😵</div>
                                <p className="text-brand-pink font-bold text-lg">Tahmin hakkın bitti!</p>
                                <p className="text-white/30 text-sm mt-1">Sonuçları bekle...</p>
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
                <p className="text-white/30 uppercase tracking-[0.4em] font-bold text-xs mb-2">{t('roomCode')}</p>
                <h1 className="text-6xl md:text-8xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-brand-cyan via-blue-400 to-purple-500">
                    {roomCode}
                </h1>
            </motion.div>

            <div className="w-full max-w-2xl grid gap-5 md:grid-cols-2">
                {/* Player list with scores */}
                <NeonCard>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold uppercase tracking-wider">{t('players')}</h2>
                        <span className="bg-brand-cyan/15 text-brand-cyan px-3 py-1 rounded-full text-xs font-bold">{players.length}/8</span>
                    </div>
                    <div className="space-y-2">
                        <AnimatePresence>
                            {players.map((p, idx) => {
                                const sc = scores.find(s => s.name === p.name);
                                const pts = sc ? sc.points : 0;
                                return (
                                    <motion.div key={p.name + idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                        className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl px-4 py-3 hover:border-brand-cyan/20 transition-colors">
                                        <span className="font-semibold text-sm">
                                            {p.name}
                                            {p.name === username && <span className="text-brand-cyan ml-1.5 text-xs">{t('you')}</span>}
                                        </span>
                                        <span className="text-brand-cyan font-mono font-bold text-sm">{pts} pt</span>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {players.length === 0 && <p className="p-6 text-center text-white/20 italic text-sm">{t('waitingPlayers')}</p>}
                    </div>
                </NeonCard>

                <div className="flex flex-col gap-5">
                    <NeonCard variant="secondary" className="flex-grow flex flex-col justify-center text-center">
                        <h3 className="text-lg font-bold mb-2">{t('rulesTitle')}</h3>
                        <p className="text-white/60 text-sm leading-relaxed">{t('rulesText1')}</p>
                        <p className="text-white/40 text-xs mt-2">{t('rulesText2')}</p>
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
                            <p className="text-white/40 animate-pulse text-sm">{t('waitingHost')}</p>
                        </NeonCard>
                    )}
                </div>
            </div>
        </div>
    );
};
