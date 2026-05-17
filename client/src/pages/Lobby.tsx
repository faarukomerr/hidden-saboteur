import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket } from '../lib/SocketContext';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SabotageInputPhase } from '../components/game/SabotageInputPhase';
import { RoleReveal } from '../components/game/RoleReveal';
import { YandiOverlay } from '../components/game/YandiOverlay';
import { CircularTimer } from '../components/ui/CircularTimer';
import { ScorePopup } from '../components/ui/ScorePopup';
import { useLanguage } from '../lib/i18n';
import { LanguageToggle } from '../components/ui/LanguageToggle';
import { TextReveal } from '../components/ui/TextReveal';
import confetti from 'canvas-confetti';
import { playSound } from '../lib/utils';
import {
    Trophy, Settings, Users, Gamepad2, ArrowLeft, RotateCcw,
    Home, Clock, AlertCircle, Cog, Star, Zap,
    MessageSquare, QrCode, X, Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player { id: string; name: string; score: number; }
interface ScoreEntry { name: string; socketId: string; points: number; }
interface ScorePopupItem { id: string; points: number; }
interface ChatMsg { name: string; message: string; timestamp: number; }
type GamePhase = 'lobby' | 'sabotage_input' | 'narration' | 'round_summary' | 'game_over' | 'grand_winner';

// ─── Per-player color palette ─────────────────────────────────────────────────
const COLORS = [
    { main: '#00F0FF', bg: 'rgba(0,240,255,0.08)', border: 'rgba(0,240,255,0.22)' },
    { main: '#FF0055', bg: 'rgba(255,0,85,0.08)',  border: 'rgba(255,0,85,0.22)' },
    { main: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.22)' },
    { main: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)' },
    { main: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.22)' },
    { main: '#F97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.22)' },
    { main: '#EC4899', bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.22)' },
    { main: '#6366F1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.22)' },
];

function playerColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h |= 0; }
    return COLORS[Math.abs(h) % COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────
export const Lobby = () => {
    const { id: roomCode } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const username = searchParams.get('user');
    const isHost = searchParams.get('host') === 'true';
    const password = searchParams.get('pwd') || undefined;
    const { t, language } = useLanguage();

    // Game state
    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<GamePhase>('lobby');
    const [myRole, setMyRole] = useState<'narrator' | 'saboteur' | 'guesser' | null>(null);
    const [targetScore, setTargetScore] = useState<number | null>(50);
    const [category, setCategory] = useState('Rastgele');
    const [grandWinnerData, setGrandWinnerData] = useState<any>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);
    const [roundId, setRoundId] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [endTime, setEndTime] = useState<number | null>(null);
    const [totalTime, setTotalTime] = useState(120);
    const [saboteurWords, setSaboteurWords] = useState<string[]>([]);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [guessesLeft, setGuessesLeft] = useState(3);
    const [guessInput, setGuessInput] = useState('');
    const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);
    const [commentary, setCommentary] = useState<string | null>(null);
    const [scores, setScores] = useState<ScoreEntry[]>([]);
    const [summaryData, setSummaryData] = useState<{ targetWord: string; winnerName: string; reason: string } | null>(null);

    // Overlay state
    const [roleRevealData, setRoleRevealData] = useState<{ role: 'narrator' | 'saboteur' | 'guesser'; targetWord: string | null } | null>(null);
    const [yandiData, setYandiData] = useState<{ word: string } | null>(null);
    const [scorePopups, setScorePopups] = useState<ScorePopupItem[]>([]);
    const [displayScore, setDisplayScore] = useState(0);
    const prevScoresRef = useRef<ScoreEntry[]>([]);

    // Chat state
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // QR state
    const [isQrOpen, setIsQrOpen] = useState(false);

    // ─── Grand winner score counter ───────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'grand_winner' || !grandWinnerData) return;
        setDisplayScore(0);
        const target = grandWinnerData.score as number;
        const step = Math.max(1, Math.ceil(target / 55));
        const id = setInterval(() => {
            setDisplayScore(prev => {
                const next = prev + step;
                if (next >= target) { clearInterval(id); return target; }
                return next;
            });
        }, 22);
        return () => clearInterval(id);
    }, [phase, grandWinnerData]);

    // ─── Chat scroll ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, isChatOpen]);

    // ─── Round reset ──────────────────────────────────────────────────────────
    const resetRoundState = () => {
        setMyRole(null); setTargetWord(null); setRoundId('');
        setTimeLeft(0); setEndTime(null); setTotalTime(120);
        setSaboteurWords([]); setSelectedWord(null);
        setGuessesLeft(3); setGuessInput('');
        setToast(null); setCommentary(null);
    };

    // ─── Socket handlers ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !roomCode || !username) { navigate('/'); return; }
        if (isConnected) socket.emit('join_room', { roomCode, username, password });

        socket.on('room_state_update', (d: { players: Player[] }) => setPlayers(d.players || []));

        socket.on('role_assigned', (d: any) => {
            resetRoundState();
            setMyRole(d.role);
            setTargetWord(d.targetWord || null);
            setRoundId(d.roundId || '');
            setRoleRevealData({ role: d.role, targetWord: d.targetWord || null });
        });

        socket.on('phase_changed', (d: { phase: any }) => setPhase(d.phase));

        socket.on('saboteur_words_list', (d: { words: string[] }) => setSaboteurWords(d.words));
        socket.on('sabotage_words_saved', (d: { words: string[] }) => setSaboteurWords(d.words || []));

        socket.on('timer_start', (d: { endTime: number; total?: number }) => {
            setEndTime(d.endTime);
            if (d.total) setTotalTime(d.total);
        });

        socket.on('scores_update', (d: { scores: ScoreEntry[] }) => {
            const prev = prevScoresRef.current;
            d.scores.forEach(ns => {
                const ps = prev.find(s => s.name === ns.name);
                const diff = ns.points - (ps?.points ?? 0);
                if (diff > 0 && ns.name === username) {
                    setScorePopups(p => [...p, { id: `${Date.now()}-${Math.random()}`, points: diff }]);
                }
            });
            prevScoresRef.current = d.scores;
            setScores(d.scores);
        });

        socket.on('sabotage_confirmed', (d: { word: string }) => {
            playSound('buzzer');
            setYandiData({ word: d.word });
        });

        socket.on('grand_winner', (d: any) => {
            playSound('win');
            confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });
            setTimeout(() => confetti({ particleCount: 90, spread: 55, origin: { x: 0.15, y: 0.65 } }), 350);
            setTimeout(() => confetti({ particleCount: 90, spread: 55, origin: { x: 0.85, y: 0.65 } }), 650);
            setGrandWinnerData(d);
            setPhase('grand_winner');
        });

        socket.on('sabotage_failed', () => showToast('wrong', '❌ Bu yasaklı kelimelerden biri değildi!', 3000));

        socket.on('host_commentary', (d: { message: string }) => {
            setCommentary(d.message);
            setTimeout(() => setCommentary(null), 6000);
        });

        socket.on('guess_result', (d: { guessWord: string; guesserName: string }) => {
            showToast('wrong', `❌ ${d.guesserName}: "${d.guessWord}" yanlış`, 3000);
        });

        socket.on('round_summary', (d: { targetWord: string; winnerName: string; reason: string }) => {
            setSummaryData(d);
            setPhase('round_summary');
            setTimeLeft(0); setEndTime(null);
            if (d.reason === 'guess') {
                playSound('ding');
                confetti({ particleCount: 70, spread: 65, origin: { y: 0.65 } });
            }
        });

        socket.on('game_over', () => { setPhase('game_over'); setTimeLeft(0); setEndTime(null); });
        socket.on('force_reset', () => resetRoundState());

        socket.on('chat_message', (msg: ChatMsg) => {
            setChatMessages(p => [...p, msg]);
            setUnreadCount(c => c + 1);
        });
        socket.on('chat_history', (d: { messages: ChatMsg[] }) => {
            setChatMessages(d.messages);
        });

        return () => {
            ['room_state_update', 'role_assigned', 'phase_changed', 'saboteur_words_list',
             'sabotage_words_saved', 'timer_start', 'scores_update', 'sabotage_confirmed',
             'sabotage_failed', 'host_commentary', 'guess_result', 'round_summary',
             'game_over', 'force_reset', 'grand_winner', 'chat_message', 'chat_history',
            ].forEach(e => socket.off(e));
        };
    }, [socket, isConnected, roomCode, username, navigate, password]);

    // Reset unread when chat is opened
    useEffect(() => { if (isChatOpen) setUnreadCount(0); }, [isChatOpen]);

    // ─── Timer tick ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!endTime) { setTimeLeft(0); return; }
        let frame: number;
        const tick = () => {
            const r = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(r);
            if (r > 0) frame = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(frame);
    }, [endTime]);

    const showToast = (type: string, msg: string, ms: number) => {
        setToast({ type, msg }); setTimeout(() => setToast(null), ms);
    };

    const sendChat = () => {
        if (!chatInput.trim()) return;
        socket?.emit('send_chat', { roomCode, message: chatInput.trim() });
        setChatInput('');
    };

    // ─── Share URL for QR ─────────────────────────────────────────────────────
    const shareUrl = `${window.location.origin}/?code=${roomCode}`;

    // ─── Sub-components ───────────────────────────────────────────────────────

    const FloatingTimer = () => {
        if (!endTime || timeLeft <= 0) return null;
        return (
            <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center pt-[calc(0.4rem+env(safe-area-inset-top))] pb-1.5 pointer-events-none">
                <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-5 py-1.5 shadow-2xl">
                    <CircularTimer timeLeft={timeLeft} total={totalTime} />
                </div>
            </div>
        );
    };

    const NavButtons = () => (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/75 backdrop-blur-3xl p-1.5 rounded-full border border-white/10 shadow-2xl">
            <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => socket?.emit('return_to_lobby', { roomCode })}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/15 text-white/55 hover:text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-white/5 transition-colors min-h-[44px]"
            >
                <Home className="w-3.5 h-3.5" /> Lobiye Dön
            </motion.button>
            <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => socket?.emit('restart_round', { roomCode })}
                className="flex items-center gap-2 bg-brand-pink/10 hover:bg-brand-pink/20 text-brand-pink px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-brand-pink/20 transition-colors min-h-[44px]"
            >
                <RotateCcw className="w-3.5 h-3.5" /> Yeniden Başlat
            </motion.button>
        </div>
    );

    const MiniScoreboard = () => {
        if (scores.length === 0) return null;
        return (
            <motion.div
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                className="fixed right-3 z-50 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 min-w-[130px] shadow-2xl"
                style={{ top: 'calc(4.8rem + env(safe-area-inset-top))' }}
            >
                <p className="text-[9px] text-white/25 font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Trophy className="w-2.5 h-2.5" /> Skor
                </p>
                {scores.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex justify-between items-center gap-2 py-0.5">
                        <span className={`text-[11px] font-medium truncate ${s.name === username ? 'text-brand-cyan' : 'text-white/45'}`}>
                            {i === 0 ? '👑 ' : `${i + 1}. `}{s.name}
                        </span>
                        <span className="text-brand-cyan font-mono font-black text-[11px] shrink-0">{s.points}</span>
                    </div>
                ))}
            </motion.div>
        );
    };

    const ToastOverlay = () => (
        <AnimatePresence>
            {toast && (
                <motion.div key="toast"
                    initial={{ y: -80, opacity: 0, scale: 0.88 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -80, opacity: 0 }}
                    className={`fixed top-24 left-1/2 -translate-x-1/2 z-[70] px-6 py-4 rounded-2xl font-bold text-white text-center shadow-2xl border max-w-sm backdrop-blur-md
                        ${toast.type === 'sabotage' ? 'bg-brand-pink/90 border-brand-pink' :
                          toast.type === 'correct'  ? 'bg-green-500/90 border-green-400' :
                                                      'bg-red-600/90 border-red-500'}`}
                >
                    {toast.msg}
                </motion.div>
            )}
            {commentary && (
                <motion.div key="comm"
                    initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                    className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[70] max-w-sm px-6 py-4 rounded-2xl bg-black/90 border border-brand-cyan/50 text-white text-center shadow-2xl backdrop-blur-md"
                >
                    🎙️ {commentary}
                </motion.div>
            )}
        </AnimatePresence>
    );

    const AnimatedDots = () => (
        <div className="flex gap-1.5 justify-center mt-3">
            {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-cyan/40"
                    animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1.2, delay: i * 0.3, repeat: Infinity }}
                />
            ))}
        </div>
    );

    // ─── Chat Panel ───────────────────────────────────────────────────────────
    const ChatPanel = () => (
        <AnimatePresence>
            {isChatOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.96 }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                    className="fixed bottom-[max(5rem,calc(4rem+env(safe-area-inset-bottom)))] right-3 z-[55] w-72 sm:w-80 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                    style={{ maxHeight: '55vh' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-brand-cyan" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Sohbet</span>
                        </div>
                        <button onClick={() => setIsChatOpen(false)} className="text-white/30 hover:text-white/70 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 overscroll-contain">
                        {chatMessages.length === 0 ? (
                            <p className="text-white/20 text-[10px] text-center py-4 uppercase tracking-widest">Henüz mesaj yok</p>
                        ) : chatMessages.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.name === username ? 'items-end' : 'items-start'}`}>
                                {(i === 0 || chatMessages[i - 1].name !== msg.name) && (
                                    <span className="text-[9px] font-bold mb-0.5 px-1"
                                        style={{ color: playerColor(msg.name).main }}>
                                        {msg.name === username ? 'Sen' : msg.name}
                                    </span>
                                )}
                                <div className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] break-words leading-snug ${
                                    msg.name === username
                                        ? 'bg-brand-cyan/15 text-white rounded-tr-sm'
                                        : 'bg-white/[0.07] text-white/80 rounded-tl-sm'
                                }`}>
                                    {msg.message}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-white/[0.07] flex gap-2">
                        <input
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-brand-cyan/40 transition-colors"
                            placeholder="Mesaj yaz..."
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                            maxLength={200}
                        />
                        <motion.button
                            whileTap={{ scale: 0.88 }}
                            onClick={sendChat}
                            disabled={!chatInput.trim()}
                            className="bg-brand-cyan/15 hover:bg-brand-cyan/25 disabled:opacity-30 text-brand-cyan px-3 py-2 rounded-xl transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ─── Floating chat button (game phases) ──────────────────────────────────
    const ChatButton = () => (
        <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={() => setIsChatOpen(p => !p)}
            className="fixed bottom-[max(5rem,calc(4rem+env(safe-area-inset-bottom)))] left-3 z-[55] bg-black/80 backdrop-blur-xl border border-white/10 rounded-full p-3 shadow-xl"
        >
            <div className="relative">
                <MessageSquare className="w-5 h-5 text-white/50" />
                {unreadCount > 0 && !isChatOpen && (
                    <motion.span
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-1.5 bg-brand-pink text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center"
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                )}
            </div>
        </motion.button>
    );

    // ─── QR Modal ────────────────────────────────────────────────────────────
    const QrModal = () => (
        <AnimatePresence>
            {isQrOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex items-center justify-center p-6"
                    onClick={() => setIsQrOpen(false)}
                >
                    <motion.div
                        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.85, opacity: 0 }}
                        transition={{ type: 'spring', bounce: 0.3 }}
                        onClick={e => e.stopPropagation()}
                        className="bg-[#120A17] border border-white/10 rounded-3xl p-6 flex flex-col items-center gap-4 max-w-xs w-full shadow-2xl"
                    >
                        <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Odaya Davet</span>
                            <button onClick={() => setIsQrOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* QR Code */}
                        <div className="p-3 bg-white rounded-2xl">
                            <QRCodeSVG
                                value={shareUrl}
                                size={180}
                                bgColor="#ffffff"
                                fgColor="#120A17"
                                level="M"
                            />
                        </div>

                        <div className="text-center w-full">
                            <p className="text-brand-cyan font-black text-2xl tracking-widest mb-1">{roomCode}</p>
                            <p className="text-white/30 text-[10px] uppercase tracking-widest">Oda Kodu</p>
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                navigator.clipboard.writeText(shareUrl);
                                showToast('correct', '📋 Link kopyalandı!', 2000);
                            }}
                            className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                            Linki Kopyala
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ─── Phase views ──────────────────────────────────────────────────────────

    const renderContent = () => {

        // ── GRAND WINNER ─────────────────────────────────────────────────────
        if (phase === 'grand_winner' && grandWinnerData) {
            const stars = Array.from({ length: 14 }, (_, i) => ({
                left: `${(i * 43 + 7) % 92}%`, top: `${(i * 61 + 9) % 85}%`,
                delay: i * 0.18, dur: 1.4 + (i % 4) * 0.4,
            }));
            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center p-6 relative overflow-hidden">
                    {stars.map((s, i) => (
                        <motion.div key={i} className="absolute pointer-events-none"
                            style={{ left: s.left, top: s.top }}
                            animate={{ opacity: [0, 0.7, 0], scale: [0.4, 1.6, 0.4] }}
                            transition={{ duration: s.dur, delay: s.delay, repeat: Infinity }}>
                            <Star className="w-3.5 h-3.5 text-brand-cyan/30" fill="currentColor" />
                        </motion.div>
                    ))}
                    <div className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at center, rgba(0,240,255,0.07) 0%, transparent 68%)' }} />

                    <motion.div
                        initial={{ scale: 0.65, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.4 }}
                        className="max-w-sm w-full flex flex-col items-center relative z-10"
                    >
                        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2, type: 'spring', bounce: 0.55 }} className="mb-5">
                            <motion.div animate={{ rotate: [0, -6, 6, -3, 0] }} transition={{ duration: 0.7, delay: 0.6 }}>
                                <Trophy className="w-20 h-20 md:w-28 md:h-28 text-brand-cyan"
                                    style={{ filter: 'drop-shadow(0 0 35px rgba(0,240,255,0.75))' }} />
                            </motion.div>
                        </motion.div>

                        <TextReveal text="ŞAMPİYON"
                            className="text-[clamp(2.2rem,8vw,4rem)] font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-cyan to-brand-pink mb-3 uppercase tracking-tighter" />

                        <motion.h2 initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.65, type: 'spring', bounce: 0.3 }}
                            className="text-3xl md:text-4xl text-white font-bold mb-8 tracking-wide">
                            {grandWinnerData.winnerName}
                        </motion.h2>

                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.85 }} className="mb-8 w-full">
                            <NeonCard variant="secondary">
                                <p className="text-white/25 uppercase tracking-widest text-[9px] font-black mb-2">Final Skor</p>
                                <p className="text-[clamp(3rem,11vw,5rem)] font-black font-mono text-brand-cyan tabular-nums"
                                    style={{ textShadow: '0 0 35px rgba(0,240,255,0.65)' }}>
                                    {displayScore}
                                </p>
                            </NeonCard>
                        </motion.div>

                        {isHost && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="w-full">
                                <Button size="xl" className="w-full flex items-center justify-center gap-3"
                                    onClick={() => socket?.emit('restart_round', { roomCode })}>
                                    <RotateCcw className="w-5 h-5" /> Yeni Oyun Başlat
                                </Button>
                            </motion.div>
                        )}
                    </motion.div>
                </div>
            );
        }

        // ── ROUND SUMMARY ─────────────────────────────────────────────────────
        if (phase === 'round_summary' && summaryData) {
            const isTimeout = summaryData.reason === 'timeout';
            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center p-4 sm:p-6 pb-[max(7rem,calc(6rem+env(safe-area-inset-bottom)))]">
                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.4 }}
                        className="flex flex-col items-center w-full max-w-sm">
                        <motion.div className="mb-6"
                            animate={!isTimeout ? { rotate: [0, -10, 10, -5, 0] } : {}}
                            transition={{ delay: 0.3, duration: 0.5 }}>
                            {isTimeout
                                ? <Clock className="w-20 h-20 text-brand-pink" style={{ filter: 'drop-shadow(0 0 22px rgba(255,0,85,0.55))' }} />
                                : <Trophy className="w-20 h-20 text-green-400" style={{ filter: 'drop-shadow(0 0 22px rgba(74,222,128,0.55))' }} />
                            }
                        </motion.div>

                        <h1 className="text-3xl md:text-4xl font-black mb-4">
                            {isTimeout
                                ? <TextReveal text="Süre Doldu!" className="text-brand-pink" />
                                : <TextReveal text={`${summaryData.winnerName} Kazandı!`} className="text-green-400" />
                            }
                        </h1>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                            className="flex items-center gap-3 mb-8">
                            <span className="text-white/40 text-base">Kelime:</span>
                            <span className="text-white font-black text-2xl tracking-widest">{summaryData.targetWord}</span>
                        </motion.div>

                        {scores.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }} className="mb-8 w-full">
                                <NeonCard>
                                    <p className="text-[9px] text-white/25 font-black uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                        <Trophy className="w-3 h-3" /> Skor Tablosu
                                    </p>
                                    <div className="space-y-2">
                                        {scores.map((s, i) => {
                                            const col = playerColor(s.name);
                                            return (
                                                <div key={i}
                                                    className="flex justify-between items-center px-4 py-2.5 rounded-xl"
                                                    style={{
                                                        background: i === 0 ? col.bg : s.name === username ? 'rgba(255,255,255,0.04)' : 'transparent',
                                                        border: i === 0 ? `1px solid ${col.border}` : '1px solid transparent',
                                                    }}>
                                                    <span className="font-bold text-sm flex items-center gap-2">
                                                        {i === 0 ? '👑 ' : `${i + 1}. `}
                                                        <span style={{ color: i === 0 ? col.main : undefined }}>{s.name}</span>
                                                        {s.name === username && <span className="text-[9px] text-white/25 uppercase tracking-wider">(sen)</span>}
                                                    </span>
                                                    <span className="font-mono font-black text-sm" style={{ color: col.main }}>{s.points} pt</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </NeonCard>
                            </motion.div>
                        )}

                        <div className="flex gap-3 flex-col sm:flex-row w-full">
                            {isHost && (
                                <Button size="xl" className="flex-1 flex items-center justify-center gap-2"
                                    onClick={() => socket?.emit('next_round', { roomCode })}>
                                    <Zap className="w-5 h-5" /> Sonraki Tur
                                </Button>
                            )}
                            <Button size="xl" variant="secondary" className="flex-1 flex items-center justify-center gap-2"
                                onClick={() => socket?.emit('return_to_lobby', { roomCode })}>
                                <Home className="w-5 h-5" /> Lobiye Dön
                            </Button>
                        </div>
                        {!isHost && (
                            <p className="text-white/25 text-xs mt-4 animate-pulse">
                                Kurucunun sonraki turu başlatmasını bekleyin...
                            </p>
                        )}
                    </motion.div>
                </div>
            );
        }

        // ── GAME OVER ─────────────────────────────────────────────────────────
        if (phase === 'game_over') {
            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center p-4 sm:p-6 pb-[max(7rem,calc(6rem+env(safe-area-inset-bottom)))] relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(255,0,85,0.1) 0%, transparent 65%)' }} />

                    <motion.div initial={{ scale: 0.55, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.45 }}
                        className="flex flex-col items-center max-w-sm w-full relative z-10">
                        <motion.div className="text-[80px] md:text-[100px] leading-none mb-3 select-none"
                            animate={{ scale: [1, 1.06, 1], rotate: [0, 3, -3, 0] }}
                            transition={{ duration: 1.8, repeat: Infinity }}>
                            🔥
                        </motion.div>

                        <h1 className="text-[clamp(3rem,14vw,6rem)] font-black italic text-brand-pink mb-3"
                            style={{ textShadow: '0 0 70px rgba(255,0,85,0.65)' }}>
                            YANDI!
                        </h1>
                        <p className="text-white/35 text-sm mb-8">Sabotajcı kazandı — anlatıcı tuzağa düştü!</p>

                        {scores.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.35 }} className="mb-8 w-full">
                                <NeonCard variant="danger">
                                    <p className="text-[9px] text-white/25 font-black uppercase tracking-widest mb-4">Final Skor</p>
                                    <div className="space-y-2">
                                        {scores.map((s, i) => (
                                            <div key={i}
                                                className="flex justify-between items-center px-4 py-2.5 rounded-xl"
                                                style={{
                                                    background: i === 0 ? 'rgba(255,0,85,0.1)' : 'transparent',
                                                    border: i === 0 ? '1px solid rgba(255,0,85,0.3)' : '1px solid transparent',
                                                }}>
                                                <span className="font-bold text-sm">{i === 0 ? '💀 ' : `${i + 1}. `}{s.name}</span>
                                                <span className="text-brand-pink font-mono font-black text-sm">{s.points}</span>
                                            </div>
                                        ))}
                                    </div>
                                </NeonCard>
                            </motion.div>
                        )}

                        <div className="flex gap-3 flex-col sm:flex-row w-full">
                            {isHost && (
                                <Button size="xl" className="flex-1 flex items-center justify-center gap-2"
                                    onClick={() => socket?.emit('next_round', { roomCode })}>
                                    <Zap className="w-5 h-5" /> Yeni Tur
                                </Button>
                            )}
                            <Button size="xl" variant="secondary" className="flex-1 flex items-center justify-center gap-2"
                                onClick={() => socket?.emit('return_to_lobby', { roomCode })}>
                                <Home className="w-5 h-5" /> Lobiye Dön
                            </Button>
                        </div>
                    </motion.div>
                </div>
            );
        }

        // ── SABOTAGE INPUT ────────────────────────────────────────────────────
        if (phase === 'sabotage_input') {
            if (myRole === 'saboteur') {
                return (
                    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 sm:p-6 pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))]">
                        <SabotageInputPhase roomCode={roomCode!} roundId={roundId} targetWord={targetWord || '?'} />
                        <NavButtons />
                        <ToastOverlay />
                    </div>
                );
            }

            const isNarrator = myRole === 'narrator';
            const badgeColor = isNarrator ? '#00F0FF' : '#8B5CF6';
            const badgeBg = isNarrator ? 'rgba(0,240,255,0.08)' : 'rgba(139,92,246,0.08)';
            const badgeBorder = isNarrator ? 'rgba(0,240,255,0.22)' : 'rgba(139,92,246,0.22)';

            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 text-center pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))]">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center">
                        <div className="relative w-32 h-32 mb-8">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
                                style={{ filter: 'drop-shadow(0 0 14px rgba(0,240,255,0.35))' }}>
                                <Cog className="w-32 h-32 text-brand-cyan/20" strokeWidth={1.2} />
                            </motion.div>
                            <div className="absolute -top-2 -right-3">
                                <motion.div animate={{ rotate: -360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}>
                                    <Cog className="w-12 h-12 text-brand-pink/25" strokeWidth={1.5} />
                                </motion.div>
                            </div>
                            <div className="absolute -bottom-1 -left-3">
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}>
                                    <Cog className="w-8 h-8 text-brand-cyan/15" strokeWidth={1.5} />
                                </motion.div>
                            </div>
                        </div>

                        <motion.div
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-8 text-[11px] font-black uppercase tracking-widest"
                            style={{ background: badgeBg, borderColor: badgeBorder, color: badgeColor }}
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        >
                            {isNarrator ? '📢 Anlatıcı' : '🔍 Tahminci'}
                        </motion.div>

                        <NeonCard className="max-w-xs w-full text-center">
                            <p className="text-brand-cyan font-black tracking-widest uppercase text-sm mb-1">
                                Sabotajcılar Tuzak Kuruyor
                            </p>
                            <AnimatedDots />
                            <p className="text-white/25 text-xs mt-4">Hazır ol — tur yakında başlıyor!</p>
                        </NeonCard>
                    </motion.div>
                    <NavButtons />
                    <ToastOverlay />
                </div>
            );
        }

        // ── NARRATION ─────────────────────────────────────────────────────────
        if (phase === 'narration') {

            if (myRole === 'narrator' && !endTime) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 sm:p-6 text-center pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))]">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center w-full max-w-md">
                            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
                                <Clock className="w-12 h-12 text-brand-cyan/50 mb-4"
                                    style={{ filter: 'drop-shadow(0 0 16px rgba(0,240,255,0.5))' }} />
                            </motion.div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-widest mb-2 mt-2">Süre Seç</h2>
                            <p className="text-white/25 text-[10px] mb-10 uppercase tracking-widest">Bu tur için kaç dakikan olsun?</p>

                            <div className="grid grid-cols-3 gap-3 w-full max-w-xs sm:max-w-sm">
                                {[
                                    { l: '1 dk', s: 60, sub: 'Hızlı' },
                                    { l: '1:30', s: 90, sub: 'Standart' },
                                    { l: '2 dk', s: 120, sub: 'Detaylı' },
                                ].map(opt => (
                                    <motion.button key={opt.s}
                                        whileHover={{ scale: 1.06, y: -4 }} whileTap={{ scale: 0.96 }}
                                        onClick={() => socket?.emit('set_timer', { roomCode, durationSeconds: opt.s })}
                                        className="flex flex-col items-center p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-brand-cyan/40 hover:bg-brand-cyan/5 transition-all group"
                                    >
                                        <span className="text-xl font-black text-white group-hover:text-brand-cyan transition-colors">{opt.l}</span>
                                        <span className="text-[9px] text-white/25 uppercase tracking-widest mt-1 group-hover:text-brand-cyan/50 transition-colors">{opt.sub}</span>
                                    </motion.button>
                                ))}
                            </div>

                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                                className="mt-8 w-full max-w-xs sm:max-w-sm">
                                <NeonCard>
                                    <p className="text-[9px] text-white/25 uppercase tracking-widest font-black mb-3">🎯 Hedef Kelimen</p>
                                    <p className="text-[clamp(2rem,8vw,3.5rem)] font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 tracking-tight">
                                        {targetWord}
                                    </p>
                                </NeonCard>
                            </motion.div>
                        </motion.div>
                        <NavButtons />
                    </div>
                );
            }

            if (myRole === 'narrator') {
                return (
                    <>
                        <FloatingTimer />
                        <MiniScoreboard />
                        <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center px-4
                            pt-[calc(5.5rem+env(safe-area-inset-top))]
                            pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))]">
                            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="w-full max-w-sm">
                                <motion.p className="text-[10px] text-brand-cyan font-black uppercase tracking-[0.35em] mb-6"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                                    📢 Sen Anlatıcısın
                                </motion.p>
                                <NeonCard className="py-8 px-6 mb-6">
                                    <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest mb-4">🎯 Hedef Kelime</p>
                                    <h1 className="text-[clamp(2.5rem,10vw,5rem)] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50">
                                        {targetWord}
                                    </h1>
                                </NeonCard>
                                <motion.div
                                    className="flex items-start gap-3 bg-brand-pink/10 border border-dashed border-brand-pink/25 rounded-2xl p-4 text-left"
                                    animate={{ borderColor: ['rgba(255,0,85,0.25)', 'rgba(255,0,85,0.55)', 'rgba(255,0,85,0.25)'] }}
                                    transition={{ duration: 2.5, repeat: Infinity }}>
                                    <span className="text-brand-pink text-lg flex-shrink-0">⚠️</span>
                                    <div>
                                        <p className="text-brand-pink font-bold text-[10px] uppercase tracking-widest mb-1">Uyarı</p>
                                        <p className="text-white/45 text-sm leading-relaxed">Kelimeyi anlat ama sabotajcının tuzaklarına DÜŞME!</p>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </div>
                        <NavButtons />
                        <ToastOverlay />
                    </>
                );
            }

            if (myRole === 'saboteur') {
                return (
                    <>
                        <FloatingTimer />
                        <MiniScoreboard />
                        <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center p-4 sm:p-6
                            pt-[calc(5.5rem+env(safe-area-inset-top))]
                            pb-[max(6.5rem,calc(5.5rem+env(safe-area-inset-bottom)))]">
                            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="w-full max-w-sm">
                                <motion.div
                                    className="inline-flex items-center gap-2 bg-brand-pink/10 border border-brand-pink/25 px-4 py-1.5 rounded-full mb-3"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-pink">🕵️ Sabotajcı</span>
                                </motion.div>
                                <p className="text-white/25 text-xs mt-2 mb-1">
                                    Hedef: <span className="text-brand-pink font-bold">{targetWord}</span>
                                </p>
                                <p className="text-white/20 text-[10px] mb-7">Anlatıcı yasaklı kelimelerden birini söylerse tıkla!</p>

                                <div className="flex flex-wrap gap-3 justify-center mb-8">
                                    {saboteurWords.length > 0 ? saboteurWords.map((w, i) => (
                                        <motion.button key={i}
                                            whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }}
                                            onClick={() => setSelectedWord(w === selectedWord ? null : w)}
                                            className={`px-7 py-3.5 rounded-2xl font-bold text-lg border-2 transition-all duration-200
                                                ${selectedWord === w
                                                    ? 'bg-brand-pink text-white border-brand-pink shadow-[0_0_35px_rgba(255,0,85,0.55)] scale-105'
                                                    : 'bg-brand-pink/10 text-brand-pink border-brand-pink/25 hover:bg-brand-pink/20 hover:border-brand-pink/50'}`}>
                                            {w}
                                        </motion.button>
                                    )) : (
                                        <div className="flex flex-col items-center gap-2 py-4">
                                            <AnimatedDots />
                                            <p className="text-white/25 text-sm mt-2">Kelimeler yükleniyor...</p>
                                        </div>
                                    )}
                                </div>

                                <Button variant="danger" size="xl"
                                    className="w-full shadow-[0_0_45px_rgba(255,0,85,0.35)] flex items-center justify-center gap-3"
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
                        </div>
                        <NavButtons />
                        <ToastOverlay />
                    </>
                );
            }

            // Guesser
            return (
                <>
                    <FloatingTimer />
                    <MiniScoreboard />
                    <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center p-4 sm:p-6 w-full max-w-md mx-auto
                        pt-[calc(5.5rem+env(safe-area-inset-top))]
                        pb-[max(6.5rem,calc(5.5rem+env(safe-area-inset-bottom)))]">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full">
                            <motion.div
                                className="inline-flex items-center gap-2 bg-brand-cyan/10 border border-brand-cyan/20 px-4 py-1.5 rounded-full mb-6"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-cyan">🔍 Tahminci</span>
                            </motion.div>

                            <p className="text-white/30 text-sm mb-7">Anlatıcıyı dinle ve hedef kelimeyi tahmin et!</p>

                            <div className="flex items-center justify-center gap-3 mb-8">
                                {[1, 2, 3].map(i => (
                                    <motion.div key={i}
                                        className={`w-4 h-4 rounded-full transition-all duration-400 ${i <= guessesLeft ? 'bg-brand-cyan' : 'bg-white/10'}`}
                                        style={i <= guessesLeft ? { boxShadow: '0 0 12px rgba(0,240,255,0.65)' } : {}}
                                        animate={i <= guessesLeft ? { scale: [1, 1.2, 1] } : {}}
                                        transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.25 }}
                                    />
                                ))}
                                <span className="text-white/25 text-xs ml-1">{guessesLeft}/3 hak</span>
                            </div>

                            {guessesLeft > 0 ? (
                                <NeonCard className="w-full">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Tahminini yaz..."
                                            value={guessInput}
                                            onChange={e => setGuessInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && guessInput.trim()) {
                                                    socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                                    setGuessInput(''); setGuessesLeft(p => p - 1);
                                                }
                                            }}
                                        />
                                        <Button disabled={!guessInput.trim()} onClick={() => {
                                            if (guessInput.trim()) {
                                                socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                                setGuessInput(''); setGuessesLeft(p => p - 1);
                                            }
                                        }}>
                                            Tahmin Et
                                        </Button>
                                    </div>
                                </NeonCard>
                            ) : (
                                <NeonCard variant="danger" className="w-full">
                                    <div className="text-4xl mb-2">😵</div>
                                    <p className="text-brand-pink font-bold text-lg">Tahmin hakkın bitti!</p>
                                    <p className="text-white/25 text-sm mt-1">Sonuçları bekle...</p>
                                </NeonCard>
                            )}
                        </motion.div>
                    </div>
                    <NavButtons />
                    <ToastOverlay />
                </>
            );
        }

        // ── LOBBY ─────────────────────────────────────────────────────────────
        return (
            <div className="flex flex-col items-center min-h-[100dvh] p-4 md:p-6 relative pt-24 pb-[calc(100px+env(safe-area-inset-bottom))]">
                {/* Top bar */}
                <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-50 pt-[calc(1rem+env(safe-area-inset-top))]">
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => navigate('/')}
                        className="bg-white/5 hover:bg-white/15 text-white/55 hover:text-white px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border border-white/10 transition-all backdrop-blur-xl min-h-[48px] flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Çık
                    </motion.button>
                    <LanguageToggle />
                </div>

                {/* Room code + QR button */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-6 w-full">
                    <p className="text-white/20 uppercase tracking-[0.5em] font-bold text-[9px] mb-2">Oda Kodu</p>
                    <div className="flex items-center justify-center gap-3">
                        <motion.h1
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                            onClick={() => {
                                navigator.clipboard.writeText(roomCode || '');
                                showToast('correct', '📋 Oda Kodu Kopyalandı!', 2000);
                            }}
                            className="text-[clamp(2.8rem,10vw,5.5rem)] font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-brand-cyan via-blue-400 to-purple-500 cursor-pointer hover:opacity-75 transition-opacity"
                            title="Kopyalamak için tıkla"
                        >
                            {roomCode}
                        </motion.h1>
                        <motion.button
                            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => setIsQrOpen(true)}
                            className="bg-white/5 hover:bg-brand-cyan/10 border border-white/10 hover:border-brand-cyan/30 rounded-2xl p-3 transition-all"
                            title="QR kod ile paylaş"
                        >
                            <QrCode className="w-5 h-5 text-white/40 hover:text-brand-cyan transition-colors" />
                        </motion.button>
                    </div>
                    <motion.p className="text-white/15 text-[9px] uppercase tracking-widest mt-1 font-bold"
                        animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }}>
                        Tıkla &amp; Kopyala · QR ile paylaş
                    </motion.p>
                </motion.div>

                <div className="w-full max-w-5xl grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-12 mt-4">
                    {/* Players */}
                    <div className="md:col-span-7 flex flex-col gap-4">
                        <NeonCard className="flex flex-col h-full">
                            <div className="flex items-center justify-between mb-5 border-b border-white/[0.07] pb-4">
                                <div className="flex items-center gap-2.5 text-white/50">
                                    <Users className="w-4 h-4" />
                                    <h2 className="text-xs font-black uppercase tracking-widest">Oyuncular</h2>
                                </div>
                                <span className="bg-brand-cyan/10 text-brand-cyan px-3 py-1 rounded-full text-[10px] font-black tracking-widest">
                                    {players.length}/8
                                </span>
                            </div>

                            <motion.div className="space-y-2.5"
                                variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } }}
                                initial="hidden" animate="show">
                                <AnimatePresence>
                                    {players.map(p => {
                                        const col = playerColor(p.name);
                                        const pts = scores.find(s => s.name === p.name)?.points ?? 0;
                                        const initials = p.name.slice(0, 2).toUpperCase();
                                        return (
                                            <motion.div key={p.name}
                                                variants={{ hidden: { opacity: 0, y: 14, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1 } }}
                                                exit={{ opacity: 0, scale: 0.9, x: -20, transition: { duration: 0.2 } }}
                                                className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all hover:scale-[1.015]"
                                                style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                                                    style={{ background: `${col.main}18`, color: col.main, border: `1px solid ${col.main}28` }}>
                                                    {initials}
                                                </div>
                                                <span className="font-bold text-sm flex-1 tracking-wide">
                                                    {p.name}
                                                    {p.name === username && (
                                                        <span className="text-[9px] ml-2 px-2 py-0.5 rounded-md uppercase tracking-widest font-black"
                                                            style={{ background: `${col.main}14`, color: col.main }}>
                                                            sen
                                                        </span>
                                                    )}
                                                </span>
                                                {pts > 0 && (
                                                    <motion.span key={pts}
                                                        initial={{ scale: 1.3 }} animate={{ scale: 1 }}
                                                        className="font-mono font-black text-sm px-2.5 py-1 rounded-lg shrink-0"
                                                        style={{ background: `${col.main}12`, color: col.main }}>
                                                        {pts} pt
                                                    </motion.span>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                {players.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-10 opacity-25">
                                        <Users className="w-10 h-10 mb-3" />
                                        <p className="text-sm italic">Oyuncular bekleniyor...</p>
                                    </div>
                                )}
                            </motion.div>
                        </NeonCard>

                        {/* Lobby Chat */}
                        <NeonCard className="flex flex-col">
                            <div className="flex items-center gap-2.5 text-white/50 border-b border-white/[0.07] pb-4 mb-4">
                                <MessageSquare className="w-4 h-4" />
                                <h2 className="text-xs font-black uppercase tracking-widest">Sohbet</h2>
                            </div>

                            <div className="flex flex-col gap-2 overflow-y-auto mb-3" style={{ maxHeight: '180px', minHeight: '80px' }}>
                                {chatMessages.length === 0 ? (
                                    <p className="text-white/15 text-[10px] text-center py-4 uppercase tracking-widest">
                                        Oyun başlamadan önce konuşun...
                                    </p>
                                ) : chatMessages.map((msg, i) => (
                                    <div key={i} className={`flex flex-col ${msg.name === username ? 'items-end' : 'items-start'}`}>
                                        {(i === 0 || chatMessages[i - 1].name !== msg.name) && (
                                            <span className="text-[9px] font-bold mb-0.5 px-1"
                                                style={{ color: playerColor(msg.name).main }}>
                                                {msg.name === username ? 'Sen' : msg.name}
                                            </span>
                                        )}
                                        <div className={`px-3 py-1.5 rounded-2xl text-sm max-w-[85%] break-words leading-snug ${
                                            msg.name === username
                                                ? 'bg-brand-cyan/15 text-white rounded-tr-sm'
                                                : 'bg-white/[0.07] text-white/80 rounded-tl-sm'
                                        }`}>
                                            {msg.message}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            <div className="flex gap-2">
                                <input
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-brand-cyan/40 transition-colors"
                                    placeholder="Mesaj yaz..."
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                                    maxLength={200}
                                />
                                <motion.button
                                    whileTap={{ scale: 0.88 }}
                                    onClick={sendChat}
                                    disabled={!chatInput.trim()}
                                    className="bg-brand-cyan/10 hover:bg-brand-cyan/20 disabled:opacity-30 text-brand-cyan px-4 py-2.5 rounded-xl transition-colors border border-brand-cyan/20"
                                >
                                    <Send className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </NeonCard>
                    </div>

                    {/* Settings / Rules + Start */}
                    <div className="md:col-span-5 flex flex-col gap-4 md:gap-6">
                        {isHost ? (
                            <NeonCard className="flex flex-col gap-5 text-left">
                                <div className="flex items-center gap-2.5 text-white/45 border-b border-white/[0.07] pb-4 mb-1">
                                    <Settings className="w-4 h-4" />
                                    <h3 className="text-xs font-black uppercase tracking-widest">Oyun Ayarları</h3>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] text-white/35 mb-2 block font-black uppercase tracking-widest">Kelime Kategorisi</label>
                                        <select
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-brand-cyan/40 text-white transition-all appearance-none cursor-pointer hover:bg-white/5"
                                            value={category} onChange={e => setCategory(e.target.value)}>
                                            <option value="Rastgele">🎲 Rastgele</option>
                                            <option value="Animals & Nature">🦁 Hayvanlar & Doğa</option>
                                            <option value="Movies & Series">🎬 Film & Dizi</option>
                                            <option value="Technology & Science">💻 Teknoloji & Bilim</option>
                                            <option value="Everyday Objects">🪑 Günlük Eşyalar</option>
                                            <option value="History & Culture">🏛️ Tarih & Kültür</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-white/35 mb-2 block font-black uppercase tracking-widest">Hedef Skor</label>
                                        <select
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-brand-pink/40 text-white transition-all appearance-none cursor-pointer hover:bg-white/5"
                                            value={targetScore ?? 'Endless'} onChange={e => setTargetScore(e.target.value === 'Endless' ? null : Number(e.target.value))}>
                                            <option value="Endless">♾️ Sonsuz</option>
                                            <option value="50">🏆 50 Puan</option>
                                            <option value="100">🏆 100 Puan</option>
                                            <option value="150">🏆 150 Puan</option>
                                        </select>
                                    </div>
                                </div>
                            </NeonCard>
                        ) : (
                            <NeonCard variant="secondary" className="flex-grow flex flex-col justify-center items-center text-center p-8">
                                <AlertCircle className="w-8 h-8 text-brand-cyan mb-4 opacity-35" />
                                <h3 className="text-sm font-black mb-3 uppercase tracking-widest">{t('rulesTitle')}</h3>
                                <p className="text-white/45 text-sm leading-relaxed">{t('rulesText1')}</p>
                                <p className="text-white/25 text-[10px] mt-4 uppercase tracking-widest">{t('rulesText2')}</p>
                            </NeonCard>
                        )}

                        {isHost ? (
                            <Button size="xl"
                                className="w-full flex items-center justify-center gap-3 group shadow-[0_15px_40px_rgba(0,240,255,0.28)]"
                                onClick={() => {
                                    if (players.length < 1) { alert(t('needPlayersAlert')); return; }
                                    socket?.emit('start_game', { roomCode, language, category, targetScore });
                                }}
                                disabled={players.length < 1}>
                                <Gamepad2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                {t('startGame')}
                            </Button>
                        ) : (
                            <NeonCard className="text-center py-5 border-brand-cyan/15">
                                <motion.p className="text-brand-cyan text-[10px] font-black uppercase tracking-widest"
                                    animate={{ opacity: [0.45, 1, 0.45] }} transition={{ duration: 2, repeat: Infinity }}>
                                    {t('waitingHost')}
                                </motion.p>
                            </NeonCard>
                        )}
                    </div>
                </div>
                <ToastOverlay />
            </div>
        );
    };

    // ─── Root render ──────────────────────────────────────────────────────────
    return (
        <>
            <AnimatePresence>
                {roleRevealData && (
                    <RoleReveal
                        key="role-reveal"
                        role={roleRevealData.role}
                        targetWord={roleRevealData.targetWord}
                        onComplete={() => setRoleRevealData(null)}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {yandiData && (
                    <YandiOverlay
                        key="yandi"
                        word={yandiData.word}
                        onComplete={() => setYandiData(null)}
                    />
                )}
            </AnimatePresence>
            <ScorePopup
                popups={scorePopups}
                onRemove={id => setScorePopups(p => p.filter(x => x.id !== id))}
            />
            <QrModal />
            {/* Floating chat button — only during game phases */}
            {phase !== 'lobby' && <ChatButton />}
            <ChatPanel />
            {renderContent()}
        </>
    );
};
