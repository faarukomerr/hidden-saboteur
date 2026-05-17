import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket } from '../lib/SocketContext';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
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
    MessageSquare, QrCode, X, Send, UserX, CheckCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player { id: string; name: string; score: number; }
interface ScoreEntry { name: string; socketId: string; points: number; }
interface ScorePopupItem { id: string; points: number; }
interface ChatMsg { name: string; message: string; timestamp: number; }
interface FlyingEmoji { id: string; emoji: string; x: number; name: string; }
type Phase = 'lobby' | 'sabotage_input' | 'narration' | 'voting' | 'round_summary' | 'game_over' | 'grand_winner';

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

const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch (_) {} };

const EMOJI_OPTIONS = ['👏', '🔥', '😱', '💀', '🎉'];

// ─── Component ────────────────────────────────────────────────────────────────
export const Lobby = () => {
    const { id: roomCode } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const username = searchParams.get('user');
    const isHostParam = searchParams.get('host') === 'true';
    const password = searchParams.get('pwd') || undefined;
    const { t, language } = useLanguage();

    // ── Game state ────────────────────────────────────────────────────────────
    const [players, setPlayers] = useState<Player[]>([]);
    const [phase, setPhase] = useState<Phase>('lobby');
    const [myRole, setMyRole] = useState<'narrator' | 'saboteur' | 'guesser' | null>(null);
    const [targetScore, setTargetScore] = useState<number | null>(50);
    const [category, setCategory] = useState('Rastgele');
    const [grandWinnerData, setGrandWinnerData] = useState<any>(null);
    const [targetWord, setTargetWord] = useState<string | null>(null);
    const [roundId, setRoundId] = useState('');
    const [roundCount, setRoundCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [endTime, setEndTime] = useState<number | null>(null);
    const [totalTime, setTotalTime] = useState(120);
    const [saboteurWords, setSaboteurWords] = useState<string[]>([]);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [guessesLeft, setGuessesLeft] = useState(3);
    const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
    const [guessInput, setGuessInput] = useState('');
    const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);
    const [commentary, setCommentary] = useState<string | null>(null);
    const [scores, setScores] = useState<ScoreEntry[]>([]);
    const [summaryData, setSummaryData] = useState<{ targetWord: string; winnerName: string; reason: string } | null>(null);
    const [isActuallyHost, setIsActuallyHost] = useState(isHostParam);

    // ── Voting state ──────────────────────────────────────────────────────────
    const [votingPlayers, setVotingPlayers] = useState<string[]>([]);
    const [myVote, setMyVote] = useState<string | null>(null);
    const [voteResults, setVoteResults] = useState<{ saboteurNames: string[]; correctVoters: string[] } | null>(null);
    const [votingTimeLeft, setVotingTimeLeft] = useState(15);
    const [voterNames, setVoterNames] = useState<string[]>([]);

    // ── Emoji reactions ───────────────────────────────────────────────────────
    const [flyingEmojis, setFlyingEmojis] = useState<FlyingEmoji[]>([]);

    // ── Overlay state ─────────────────────────────────────────────────────────
    const [roleRevealData, setRoleRevealData] = useState<{ role: 'narrator' | 'saboteur' | 'guesser'; targetWord: string | null } | null>(null);
    const [yandiData, setYandiData] = useState<{ word: string } | null>(null);
    const [scorePopups, setScorePopups] = useState<ScorePopupItem[]>([]);
    const [displayScore, setDisplayScore] = useState(0);
    const prevScoresRef = useRef<ScoreEntry[]>([]);

    // ── Chat state ────────────────────────────────────────────────────────────
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);

    // ── QR state ──────────────────────────────────────────────────────────────
    const [isQrOpen, setIsQrOpen] = useState(false);

    // ── Sound tracking ────────────────────────────────────────────────────────
    const urgentSoundedRef = useRef(false);

    // ── Grand winner score counter ────────────────────────────────────────────
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

    // ── Chat scroll & unread ──────────────────────────────────────────────────
    useEffect(() => {
        if (isChatOpen) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setUnreadCount(0);
        }
    }, [chatMessages, isChatOpen]);

    // ── Voting countdown ──────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'voting') return;
        setVotingTimeLeft(15);
        const id = setInterval(() => {
            setVotingTimeLeft(t => Math.max(0, t - 1));
        }, 1000);
        return () => clearInterval(id);
    }, [phase]);

    // ── Round reset ───────────────────────────────────────────────────────────
    const resetRoundState = useCallback(() => {
        setMyRole(null); setTargetWord(null); setRoundId('');
        setTimeLeft(0); setEndTime(null); setTotalTime(120);
        setSaboteurWords([]); setSelectedWord(null);
        setGuessesLeft(3); setGuessInput(''); setWrongGuesses([]);
        setToast(null); setCommentary(null);
        setVotingPlayers([]); setMyVote(null); setVoteResults(null);
        setVoterNames([]); setVotingTimeLeft(15);
        urgentSoundedRef.current = false;
    }, []);

    // ── Socket handlers ───────────────────────────────────────────────────────
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
        socket.on('round_info', (d: { roundCount: number }) => setRoundCount(d.roundCount));

        socket.on('timer_start', (d: { endTime: number; total?: number }) => {
            setEndTime(d.endTime);
            if (d.total) setTotalTime(d.total);
            urgentSoundedRef.current = false;
        });

        socket.on('scores_update', (d: { scores: ScoreEntry[] }) => {
            const prev = prevScoresRef.current;
            d.scores.forEach(ns => {
                const ps = prev.find(s => s.name === ns.name);
                const diff = ns.points - (ps?.points ?? 0);
                if (diff > 0 && ns.name === username) {
                    vibrate([30, 20, 50]);
                    setScorePopups(p => [...p, { id: `${Date.now()}-${Math.random()}`, points: diff }]);
                }
            });
            prevScoresRef.current = d.scores;
            setScores(d.scores);
        });

        socket.on('sabotage_confirmed', (d: { word: string }) => {
            playSound('buzzer');
            vibrate([80, 40, 200, 40, 300]);
            setYandiData({ word: d.word });
        });

        socket.on('grand_winner', (d: any) => {
            playSound('win');
            vibrate([100, 50, 100, 50, 200]);
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
            if (d.guesserName === username) setWrongGuesses(p => [...p, d.guessWord]);
            showToast('wrong', `❌ ${d.guesserName}: "${d.guessWord}" yanlış`, 3000);
        });

        socket.on('round_summary', (d: { targetWord: string; winnerName: string; reason: string }) => {
            setSummaryData(d);
            setPhase('round_summary');
            setTimeLeft(0); setEndTime(null);
            if (d.reason === 'guess') {
                playSound('ding');
                vibrate([60, 30, 120]);
                confetti({ particleCount: 70, spread: 65, origin: { y: 0.65 } });
            }
        });

        socket.on('game_over', () => { setPhase('game_over'); setTimeLeft(0); setEndTime(null); });
        socket.on('force_reset', () => resetRoundState());

        // Voting
        socket.on('voting_started', (d: { players: string[]; saboteurCount: number }) => {
            setVotingPlayers(d.players);
            setMyVote(null);
            setVoterNames([]);
            setVoteResults(null);
        });
        socket.on('vote_cast', (d: { voterName: string }) => {
            setVoterNames(p => [...p, d.voterName]);
        });
        socket.on('vote_results', (d: { saboteurNames: string[]; correctVoters: string[] }) => {
            setVoteResults(d);
            if (d.correctVoters.includes(username || '')) {
                vibrate([40, 20, 80]);
                setScorePopups(p => [...p, { id: `vote-${Date.now()}`, points: 5 }]);
            }
        });

        // Emoji reactions
        socket.on('emoji_reaction', (d: { name: string; emoji: string }) => {
            const id = `${Date.now()}-${Math.random()}`;
            const x = 10 + Math.random() * 80;
            setFlyingEmojis(p => [...p, { id, emoji: d.emoji, x, name: d.name }]);
            setTimeout(() => setFlyingEmojis(p => p.filter(e => e.id !== id)), 2200);
        });

        // Kick
        socket.on('kicked', () => {
            vibrate([100, 50, 200]);
            navigate('/?kicked=1');
        });

        // Host promotion
        socket.on('host_promoted', () => {
            setIsActuallyHost(true);
            showToast('correct', '👑 Sen artık oda kurucususun!', 3000);
        });

        // Room closed
        socket.on('room_closed', () => navigate('/'));

        socket.on('chat_message', (msg: ChatMsg) => {
            setChatMessages(p => [...p, msg]);
            setUnreadCount(c => c + 1);
        });
        socket.on('chat_history', (d: { messages: ChatMsg[] }) => setChatMessages(d.messages));

        return () => {
            ['room_state_update', 'role_assigned', 'phase_changed', 'saboteur_words_list',
             'sabotage_words_saved', 'timer_start', 'scores_update', 'sabotage_confirmed',
             'sabotage_failed', 'host_commentary', 'guess_result', 'round_summary',
             'game_over', 'force_reset', 'grand_winner', 'chat_message', 'chat_history',
             'voting_started', 'vote_cast', 'vote_results', 'emoji_reaction',
             'kicked', 'host_promoted', 'room_closed', 'round_info',
            ].forEach(e => socket.off(e));
        };
    }, [socket, isConnected, roomCode, username, navigate, password, resetRoundState]);

    // ── Timer tick + 10s sound ────────────────────────────────────────────────
    useEffect(() => {
        if (!endTime) { setTimeLeft(0); return; }
        let frame: number;
        const tick = () => {
            const r = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(r);
            if (r === 10 && !urgentSoundedRef.current) {
                urgentSoundedRef.current = true;
                playSound('tick');
                vibrate([40, 20, 40]);
            }
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

    const sendEmoji = (emoji: string) => {
        vibrate(12);
        socket?.emit('react_emoji', { roomCode, emoji });
    };

    const kickPlayer = (targetUsername: string) => {
        if (!isActuallyHost) return;
        vibrate(20);
        socket?.emit('kick_player', { roomCode, targetUsername });
    };

    const shareUrl = `${window.location.origin}/?code=${roomCode}`;

    // ─── Shared UI pieces ─────────────────────────────────────────────────────

    const FloatingTimer = () => {
        if (!endTime || timeLeft <= 0) return null;
        return (
            <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center pointer-events-none"
                style={{ paddingTop: 'calc(0.4rem + env(safe-area-inset-top))', paddingBottom: '0.5rem' }}>
                <div className="bg-black/85 backdrop-blur-2xl border border-white/10 rounded-full px-5 py-1.5 shadow-2xl">
                    <CircularTimer timeLeft={timeLeft} total={totalTime} />
                </div>
            </div>
        );
    };

    const MiniScoreboard = () => {
        if (scores.length === 0) return null;
        return (
            <motion.div
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                className="fixed right-3 z-[50] bg-black/85 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl"
                style={{ top: 'calc(5.5rem + env(safe-area-inset-top))', minWidth: '120px', maxWidth: '150px' }}
            >
                <p className="text-[8px] text-white/25 font-black uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Trophy className="w-2.5 h-2.5" /> Skor
                    {roundCount > 0 && <span className="ml-auto text-white/15">T{roundCount}</span>}
                </p>
                {scores.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex justify-between items-center gap-1.5 py-0.5">
                        <span className={`text-[10px] font-medium truncate leading-tight ${s.name === username ? 'text-brand-cyan' : 'text-white/40'}`}>
                            {i === 0 ? '👑 ' : `${i + 1}. `}{s.name}
                        </span>
                        <span className="text-brand-cyan font-mono font-black text-[10px] shrink-0">{s.points}</span>
                    </div>
                ))}
            </motion.div>
        );
    };

    const NavButtons = () => (
        <div className="fixed left-0 right-0 z-[50] flex justify-center gap-2 px-4"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <motion.button
                whileTap={{ scale: 0.94 }}
                style={{ touchAction: 'manipulation' }}
                onClick={() => { vibrate(8); socket?.emit('return_to_lobby', { roomCode }); }}
                className="flex items-center gap-2 bg-black/80 backdrop-blur-2xl text-white/50 px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-wider border border-white/10 transition-colors min-h-[48px]"
            >
                <Home className="w-3.5 h-3.5" /> Lobi
            </motion.button>
            <motion.button
                whileTap={{ scale: 0.94 }}
                style={{ touchAction: 'manipulation' }}
                onClick={() => { vibrate(8); socket?.emit('restart_round', { roomCode }); }}
                className="flex items-center gap-2 bg-brand-pink/10 backdrop-blur-2xl text-brand-pink px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-wider border border-brand-pink/20 transition-colors min-h-[48px]"
            >
                <RotateCcw className="w-3.5 h-3.5" /> Sıfırla
            </motion.button>
        </div>
    );

    const ToastOverlay = () => (
        <AnimatePresence>
            {toast && (
                <motion.div key="toast"
                    initial={{ y: -60, opacity: 0, scale: 0.88 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -60, opacity: 0 }}
                    className={`fixed left-4 right-4 z-[70] px-5 py-4 rounded-2xl font-bold text-white text-center shadow-2xl border backdrop-blur-md
                        ${toast.type === 'correct' ? 'bg-green-500/90 border-green-400' : 'bg-red-600/90 border-red-500'}`}
                    style={{ top: 'calc(5rem + env(safe-area-inset-top))' }}
                >
                    {toast.msg}
                </motion.div>
            )}
            {commentary && (
                <motion.div key="comm"
                    initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                    className="fixed left-4 right-4 z-[70] px-5 py-4 rounded-2xl bg-black/95 border border-brand-cyan/40 text-white text-center shadow-2xl backdrop-blur-md text-sm"
                    style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
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

    // Flying emoji overlay
    const FlyingEmojiOverlay = () => (
        <div className="fixed inset-0 z-[65] pointer-events-none overflow-hidden">
            <AnimatePresence>
                {flyingEmojis.map(e => (
                    <motion.div key={e.id}
                        className="absolute bottom-20 flex flex-col items-center"
                        style={{ left: `${e.x}%` }}
                        initial={{ y: 0, opacity: 1, scale: 0.5 }}
                        animate={{ y: -220, opacity: 0, scale: 1.3 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2, ease: 'easeOut' }}
                    >
                        <span className="text-3xl leading-none drop-shadow-lg">{e.emoji}</span>
                        <span className="text-[8px] text-white/40 font-bold mt-0.5 whitespace-nowrap">{e.name}</span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );

    // Emoji reaction bar — shows during game phases
    const EmojiBar = () => {
        if (phase === 'lobby' || phase === 'grand_winner') return null;
        return (
            <div className="fixed z-[55] flex gap-2"
                style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }}>
                {EMOJI_OPTIONS.map(emoji => (
                    <motion.button key={emoji}
                        whileTap={{ scale: 0.75 }}
                        style={{ touchAction: 'manipulation' }}
                        onClick={() => sendEmoji(emoji)}
                        className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl w-11 h-11 flex items-center justify-center text-lg shadow-lg"
                    >
                        {emoji}
                    </motion.button>
                ))}
            </div>
        );
    };

    const ChatPanel = () => (
        <AnimatePresence>
            {isChatOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.96 }}
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
                    className="fixed right-3 left-3 sm:left-auto sm:w-80 z-[55] bg-black/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                    style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))', maxHeight: '60vh' }}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-brand-cyan" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Sohbet</span>
                        </div>
                        <button onClick={() => setIsChatOpen(false)}
                            style={{ touchAction: 'manipulation' }}
                            className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-white/70 transition-colors rounded-full hover:bg-white/10">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 overscroll-contain scroll-smooth-touch">
                        {chatMessages.length === 0
                            ? <p className="text-white/20 text-[10px] text-center py-6 uppercase tracking-widest">Henüz mesaj yok</p>
                            : chatMessages.map((msg, i) => (
                                <div key={i} className={`flex flex-col ${msg.name === username ? 'items-end' : 'items-start'}`}>
                                    {(i === 0 || chatMessages[i - 1].name !== msg.name) && (
                                        <span className="text-[9px] font-bold mb-0.5 px-1" style={{ color: playerColor(msg.name).main }}>
                                            {msg.name === username ? 'Sen' : msg.name}
                                        </span>
                                    )}
                                    <div className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] break-words leading-snug ${
                                        msg.name === username ? 'bg-brand-cyan/15 text-white rounded-tr-sm' : 'bg-white/[0.07] text-white/80 rounded-tl-sm'
                                    }`}>
                                        {msg.message}
                                    </div>
                                </div>
                            ))
                        }
                        <div ref={chatEndRef} />
                    </div>
                    <div className="p-3 border-t border-white/[0.07] flex gap-2">
                        <input
                            ref={chatInputRef}
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/20 outline-none focus:border-brand-cyan/40 transition-colors"
                            style={{ fontSize: '16px' }}
                            placeholder="Mesaj yaz..."
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                            maxLength={200}
                            autoComplete="off"
                            autoCorrect="off"
                        />
                        <motion.button
                            whileTap={{ scale: 0.88 }}
                            onClick={sendChat}
                            disabled={!chatInput.trim()}
                            style={{ touchAction: 'manipulation' }}
                            className="bg-brand-cyan/15 hover:bg-brand-cyan/25 disabled:opacity-30 text-brand-cyan px-4 py-3 rounded-2xl transition-colors min-w-[48px] flex items-center justify-center"
                        >
                            <Send className="w-4 h-4" />
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const ChatButton = () => (
        <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.88 }}
            onClick={() => { vibrate(8); setIsChatOpen(p => !p); }}
            style={{ touchAction: 'manipulation', left: '0.75rem', bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
            className="fixed z-[55] bg-black/85 backdrop-blur-2xl border border-white/10 rounded-full p-3.5 shadow-xl"
        >
            <div className="relative">
                <MessageSquare className="w-5 h-5 text-white/50" />
                <AnimatePresence>
                    {unreadCount > 0 && !isChatOpen && (
                        <motion.span
                            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                            className="absolute -top-1.5 -right-1.5 bg-brand-pink text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center"
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
        </motion.button>
    );

    const QrModal = () => (
        <AnimatePresence>
            {isQrOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center"
                    onClick={() => setIsQrOpen(false)}
                >
                    <motion.div
                        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        transition={{ type: 'spring', bounce: 0.25 }}
                        onClick={e => e.stopPropagation()}
                        className="w-full sm:max-w-sm bg-[#120A17] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col items-center gap-5 shadow-2xl"
                        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
                    >
                        <div className="w-10 h-1 rounded-full bg-white/20 sm:hidden" />
                        <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Odaya Davet Et</span>
                            <button onClick={() => setIsQrOpen(false)}
                                style={{ touchAction: 'manipulation' }}
                                className="text-white/30 hover:text-white/60 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-3 bg-white rounded-2xl shadow-lg">
                            <QRCodeSVG value={shareUrl} size={200} bgColor="#ffffff" fgColor="#120A17" level="M" />
                        </div>
                        <div className="text-center">
                            <p className="text-brand-cyan font-black text-3xl tracking-widest mb-1">{roomCode}</p>
                            <p className="text-white/25 text-[10px] uppercase tracking-widest">Oda Kodu</p>
                        </div>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            style={{ touchAction: 'manipulation' }}
                            onClick={() => {
                                navigator.clipboard.writeText(shareUrl);
                                showToast('correct', '📋 Link kopyalandı!', 2000);
                            }}
                            className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                            Linki Kopyala
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ─── Phase renders ────────────────────────────────────────────────────────

    const renderContent = () => {

        // ── GRAND WINNER ──────────────────────────────────────────────────────
        if (phase === 'grand_winner' && grandWinnerData) {
            const stars = Array.from({ length: 16 }, (_, i) => ({
                left: `${(i * 43 + 7) % 92}%`, top: `${(i * 61 + 9) % 85}%`,
                delay: i * 0.14, dur: 1.3 + (i % 4) * 0.4,
            }));
            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center px-5 py-8 relative overflow-hidden">
                    {stars.map((s, i) => (
                        <motion.div key={i} className="absolute pointer-events-none" style={{ left: s.left, top: s.top }}
                            animate={{ opacity: [0, 0.8, 0], scale: [0.4, 1.8, 0.4] }}
                            transition={{ duration: s.dur, delay: s.delay, repeat: Infinity }}>
                            <Star className="w-3 h-3 text-brand-cyan/25" fill="currentColor" />
                        </motion.div>
                    ))}
                    <div className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at center, rgba(0,240,255,0.08) 0%, transparent 65%)' }} />

                    <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.4 }}
                        className="w-full max-w-sm flex flex-col items-center relative z-10">

                        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15, type: 'spring', bounce: 0.6 }} className="mb-5">
                            <motion.div animate={{ rotate: [0, -6, 6, -3, 0] }} transition={{ duration: 0.8, delay: 0.6 }}>
                                <Trophy className="w-24 h-24 text-brand-cyan"
                                    style={{ filter: 'drop-shadow(0 0 40px rgba(0,240,255,0.8))' }} />
                            </motion.div>
                        </motion.div>

                        <TextReveal text="ŞAMPİYON"
                            className="text-[clamp(2rem,9vw,4rem)] font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-cyan to-brand-pink mb-3 uppercase tracking-tighter" />

                        <motion.h2 initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.6, type: 'spring', bounce: 0.3 }}
                            className="text-3xl text-white font-bold mb-7 tracking-wide">
                            {grandWinnerData.winnerName}
                        </motion.h2>

                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.85 }} className="mb-6 w-full">
                            <div className="rounded-3xl p-6 text-center" style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.15)' }}>
                                <p className="text-white/20 uppercase tracking-widest text-[9px] font-black mb-2">Final Skor</p>
                                <p className="text-[clamp(3.5rem,14vw,6rem)] font-black font-mono text-brand-cyan tabular-nums leading-none"
                                    style={{ textShadow: '0 0 40px rgba(0,240,255,0.7)' }}>
                                    {displayScore}
                                </p>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="w-full flex flex-col gap-3">
                            {isActuallyHost && (
                                <>
                                    <Button size="xl" className="w-full flex items-center justify-center gap-3"
                                        onClick={() => { vibrate(15); socket?.emit('restart_game', { roomCode }); }}>
                                        <RotateCcw className="w-5 h-5" /> Tekrar Oyna
                                    </Button>
                                    <Button size="xl" variant="secondary" className="w-full flex items-center justify-center gap-3"
                                        onClick={() => { vibrate(8); socket?.emit('next_round', { roomCode }); }}>
                                        <Zap className="w-5 h-5" /> Skorları Koru &amp; Devam
                                    </Button>
                                </>
                            )}
                            {!isActuallyHost && (
                                <motion.p className="text-white/25 text-xs text-center animate-pulse">Kurucuyu bekle...</motion.p>
                            )}
                        </motion.div>
                    </motion.div>
                </div>
            );
        }

        // ── VOTING ────────────────────────────────────────────────────────────
        if (phase === 'voting') {
            const isSaboteur = myRole === 'saboteur';
            const hasVoted = !!myVote;

            return (
                <div className="flex flex-col items-center min-h-[100dvh] px-4 py-6"
                    style={{
                        paddingTop: 'calc(2rem + env(safe-area-inset-top))',
                        paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
                    }}>
                    <MiniScoreboard />

                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="w-full max-w-sm flex flex-col items-center">

                        {/* Header */}
                        <motion.div className="text-center mb-6">
                            <div className="text-5xl mb-3">🕵️</div>
                            <h2 className="text-2xl font-black uppercase tracking-wider text-white mb-1">Kim Sabotajcıydı?</h2>
                            <p className="text-white/35 text-sm">
                                {isSaboteur ? 'Sen sabotajcıydın — sonucu bekle' : hasVoted ? 'Oyun bekleniyor...' : 'Tahminini söyle!'}
                            </p>
                        </motion.div>

                        {/* Voting timer */}
                        <AnimatePresence>
                            {!voteResults && (
                                <motion.div
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex items-center gap-2 mb-5 px-4 py-2 rounded-full border"
                                    style={{ background: 'rgba(0,0,0,0.4)', borderColor: votingTimeLeft <= 5 ? 'rgba(255,0,85,0.5)' : 'rgba(255,255,255,0.1)' }}
                                >
                                    <Clock className="w-3.5 h-3.5" style={{ color: votingTimeLeft <= 5 ? '#FF0055' : 'rgba(255,255,255,0.4)' }} />
                                    <motion.span
                                        className="font-mono font-black text-sm"
                                        animate={votingTimeLeft <= 5 ? { scale: [1, 1.2, 1] } : {}}
                                        transition={{ duration: 0.5, repeat: votingTimeLeft <= 5 ? Infinity : 0 }}
                                        style={{ color: votingTimeLeft <= 5 ? '#FF0055' : 'rgba(255,255,255,0.5)' }}
                                    >
                                        {votingTimeLeft}s
                                    </motion.span>
                                    <span className="text-[9px] text-white/25 uppercase tracking-wider">kaldı</span>
                                    <span className="ml-auto text-[9px] text-white/25">{voterNames.length} oy</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Vote results */}
                        <AnimatePresence>
                            {voteResults && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                    className="w-full mb-5 rounded-3xl p-5 text-center"
                                    style={{ background: 'rgba(255,0,85,0.08)', border: '1px solid rgba(255,0,85,0.3)' }}
                                >
                                    <p className="text-[9px] font-black uppercase tracking-widest text-brand-pink/60 mb-2">💀 Sabotajcı</p>
                                    <p className="text-2xl font-black text-brand-pink mb-3">
                                        {voteResults.saboteurNames.join(', ')}
                                    </p>
                                    {voteResults.correctVoters.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-white/10">
                                            <p className="text-[9px] text-white/30 uppercase tracking-widest mb-2">✅ Doğru Bilenler (+5 pt)</p>
                                            <p className="text-white/60 text-sm font-bold">{voteResults.correctVoters.join(', ')}</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Player vote buttons */}
                        {!isSaboteur && !hasVoted && !voteResults && (
                            <div className="w-full space-y-2">
                                {votingPlayers
                                    .filter(p => p !== username)
                                    .map(playerName => {
                                        const col = playerColor(playerName);
                                        return (
                                            <motion.button key={playerName}
                                                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
                                                style={{ touchAction: 'manipulation' }}
                                                onClick={() => {
                                                    vibrate(15);
                                                    setMyVote(playerName);
                                                    socket?.emit('submit_vote', { roomCode, votedFor: playerName });
                                                }}
                                                className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 transition-all"
                                                style={{ background: col.bg, border: `1px solid ${col.border}` }}
                                            >
                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                                                    style={{ background: `${col.main}20`, color: col.main }}>
                                                    {playerName.slice(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-bold text-white text-base flex-1 text-left">{playerName}</span>
                                                <UserX className="w-4 h-4 text-white/20" />
                                            </motion.button>
                                        );
                                    })}
                            </div>
                        )}

                        {/* After vote */}
                        {!isSaboteur && hasVoted && !voteResults && (
                            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="w-full rounded-3xl p-5 text-center"
                                style={{ background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.15)' }}>
                                <CheckCircle className="w-8 h-8 text-brand-cyan mx-auto mb-2" />
                                <p className="text-brand-cyan font-bold text-sm mb-1">Oy Verildi</p>
                                <p className="text-white/40 text-xs">Sabotajcı olarak <span className="text-white font-bold">{myVote}</span> seçtin</p>
                                <AnimatedDots />
                            </motion.div>
                        )}

                        {isSaboteur && !voteResults && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="w-full rounded-3xl p-5 text-center"
                                style={{ background: 'rgba(255,0,85,0.06)', border: '1px solid rgba(255,0,85,0.2)' }}>
                                <div className="text-4xl mb-2">🕵️</div>
                                <p className="text-brand-pink font-bold text-sm mb-1">Oyuncular seni arıyor!</p>
                                <p className="text-white/30 text-xs">Sonuçlar yakında açıklanacak...</p>
                                <AnimatedDots />
                            </motion.div>
                        )}
                    </motion.div>
                    <ToastOverlay />
                </div>
            );
        }

        // ── ROUND SUMMARY ─────────────────────────────────────────────────────
        if (phase === 'round_summary' && summaryData) {
            const isTimeout = summaryData.reason === 'timeout';
            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center px-4 py-8"
                    style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}>
                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.4 }}
                        className="flex flex-col items-center w-full max-w-sm">

                        {roundCount > 0 && (
                            <p className="text-[9px] text-white/20 font-black uppercase tracking-widest mb-4">Tur {roundCount}</p>
                        )}

                        <motion.div className="mb-6"
                            animate={!isTimeout ? { rotate: [0, -10, 10, -5, 0] } : {}}
                            transition={{ delay: 0.3, duration: 0.5 }}>
                            {isTimeout
                                ? <Clock className="w-20 h-20 text-brand-pink" style={{ filter: 'drop-shadow(0 0 24px rgba(255,0,85,0.6))' }} />
                                : <Trophy className="w-20 h-20 text-green-400" style={{ filter: 'drop-shadow(0 0 24px rgba(74,222,128,0.6))' }} />
                            }
                        </motion.div>

                        <h1 className="text-3xl font-black mb-4">
                            {isTimeout
                                ? <TextReveal text="Süre Doldu!" className="text-brand-pink" />
                                : <TextReveal text={`${summaryData.winnerName} Kazandı!`} className="text-green-400" />
                            }
                        </h1>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                            className="flex items-center gap-3 mb-7">
                            <span className="text-white/40 text-sm">Kelime:</span>
                            <span className="text-white font-black text-2xl tracking-widest">{summaryData.targetWord}</span>
                        </motion.div>

                        {scores.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }} className="mb-7 w-full">
                                <NeonCard>
                                    <p className="text-[9px] text-white/25 font-black uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                        <Trophy className="w-3 h-3" /> Skor Tablosu
                                    </p>
                                    <div className="space-y-2">
                                        {scores.map((s, i) => {
                                            const col = playerColor(s.name);
                                            return (
                                                <div key={i} className="flex justify-between items-center px-4 py-2.5 rounded-2xl"
                                                    style={{
                                                        background: i === 0 ? col.bg : s.name === username ? 'rgba(255,255,255,0.04)' : 'transparent',
                                                        border: `1px solid ${i === 0 ? col.border : 'transparent'}`,
                                                    }}>
                                                    <span className="font-bold text-sm flex items-center gap-2">
                                                        {i === 0 ? '👑 ' : `${i + 1}. `}
                                                        <span style={{ color: i === 0 ? col.main : undefined }}>{s.name}</span>
                                                        {s.name === username && <span className="text-[9px] text-white/20 uppercase tracking-wider">(sen)</span>}
                                                    </span>
                                                    <span className="font-mono font-black text-sm" style={{ color: col.main }}>{s.points} pt</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </NeonCard>
                            </motion.div>
                        )}

                        <div className="flex gap-3 flex-col w-full">
                            {isActuallyHost && (
                                <Button size="xl" className="w-full flex items-center justify-center gap-2"
                                    onClick={() => { vibrate(12); socket?.emit('next_round', { roomCode }); }}>
                                    <Zap className="w-5 h-5" /> Sonraki Tur
                                </Button>
                            )}
                            <Button size="xl" variant="secondary" className="w-full flex items-center justify-center gap-2"
                                onClick={() => socket?.emit('return_to_lobby', { roomCode })}>
                                <Home className="w-5 h-5" /> Lobiye Dön
                            </Button>
                            {!isActuallyHost && <p className="text-white/25 text-xs animate-pulse">Kurucuyu bekle...</p>}
                        </div>
                    </motion.div>
                </div>
            );
        }

        // ── GAME OVER ─────────────────────────────────────────────────────────
        if (phase === 'game_over') {
            return (
                <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center px-4 py-8 relative overflow-hidden"
                    style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}>
                    <div className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(255,0,85,0.12) 0%, transparent 65%)' }} />

                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.45 }}
                        className="flex flex-col items-center max-w-sm w-full relative z-10">

                        <motion.div className="text-[90px] leading-none mb-3 select-none"
                            animate={{ scale: [1, 1.07, 1], rotate: [0, 3, -3, 0] }}
                            transition={{ duration: 1.8, repeat: Infinity }}>
                            🔥
                        </motion.div>

                        <h1 className="text-[clamp(3.5rem,16vw,7rem)] font-black italic text-brand-pink mb-2 leading-none"
                            style={{ textShadow: '0 0 80px rgba(255,0,85,0.7)' }}>
                            YANDI!
                        </h1>
                        <p className="text-white/35 text-sm mb-7">Sabotajcı kazandı — anlatıcı tuzağa düştü!</p>

                        {scores.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }} className="mb-7 w-full">
                                <NeonCard variant="danger">
                                    <p className="text-[9px] text-white/25 font-black uppercase tracking-widest mb-4">Skor</p>
                                    <div className="space-y-2">
                                        {scores.map((s, i) => (
                                            <div key={i} className="flex justify-between items-center px-4 py-2.5 rounded-2xl"
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

                        <div className="flex gap-3 flex-col w-full">
                            {isActuallyHost && (
                                <Button size="xl" className="w-full flex items-center justify-center gap-2"
                                    onClick={() => { vibrate(12); socket?.emit('next_round', { roomCode }); }}>
                                    <Zap className="w-5 h-5" /> Yeni Tur
                                </Button>
                            )}
                            <Button size="xl" variant="secondary" className="w-full flex items-center justify-center gap-2"
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
                    <div className="flex flex-col items-center min-h-[100dvh] px-4 py-6 overflow-y-auto"
                        style={{
                            paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
                            paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
                        }}>
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
                <div className="flex flex-col items-center justify-center min-h-[100dvh] p-6 text-center"
                    style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}>
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center w-full max-w-xs">
                        <div className="relative w-36 h-36 mb-8">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                                style={{ filter: 'drop-shadow(0 0 18px rgba(0,240,255,0.3))' }}>
                                <Cog className="w-36 h-36 text-brand-cyan/20" strokeWidth={1.2} />
                            </motion.div>
                            <div className="absolute -top-2 -right-2">
                                <motion.div animate={{ rotate: -360 }} transition={{ duration: 6.5, repeat: Infinity, ease: 'linear' }}>
                                    <Cog className="w-13 h-13 text-brand-pink/20" strokeWidth={1.4} style={{ width: 52, height: 52 }} />
                                </motion.div>
                            </div>
                        </div>
                        <motion.div
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border mb-6 text-[11px] font-black uppercase tracking-widest"
                            style={{ background: badgeBg, borderColor: badgeBorder, color: badgeColor }}
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                            {isNarrator ? '📢 Anlatıcı' : '🔍 Tahminci'}
                        </motion.div>
                        <div className="w-full rounded-3xl p-6 text-center"
                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <p className="text-white/50 font-black tracking-widest uppercase text-sm mb-2">
                                Sabotajcılar Tuzak Kuruyor
                            </p>
                            <AnimatedDots />
                            <p className="text-white/20 text-xs mt-4">Hazır ol — tur yakında başlıyor!</p>
                        </div>
                    </motion.div>
                    <NavButtons />
                </div>
            );
        }

        // ── NARRATION ─────────────────────────────────────────────────────────
        if (phase === 'narration') {

            if (myRole === 'narrator' && !endTime) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-4 text-center"
                        style={{
                            paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
                            paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
                        }}>
                        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center w-full max-w-sm">
                            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>
                                <Clock className="w-14 h-14 text-brand-cyan/60 mb-5"
                                    style={{ filter: 'drop-shadow(0 0 20px rgba(0,240,255,0.55))' }} />
                            </motion.div>
                            <h2 className="text-[clamp(2rem,8vw,3rem)] font-black text-white uppercase tracking-tight mb-2">Süre Seç</h2>
                            <p className="text-white/30 text-xs mb-9 uppercase tracking-widest">Bu tur için kaç dakikan olsun?</p>
                            <div className="grid grid-cols-3 gap-3 w-full mb-8">
                                {[
                                    { l: '1 dk', s: 60, sub: 'Hızlı', icon: '⚡' },
                                    { l: '1:30', s: 90, sub: 'Standart', icon: '⏱' },
                                    { l: '2 dk', s: 120, sub: 'Detaylı', icon: '🎯' },
                                ].map(opt => (
                                    <motion.button key={opt.s}
                                        whileHover={{ scale: 1.05, y: -3 }} whileTap={{ scale: 0.93 }}
                                        onClick={() => {
                                            vibrate(12);
                                            socket?.emit('set_timer', { roomCode, durationSeconds: opt.s });
                                        }}
                                        className="flex flex-col items-center py-5 px-2 rounded-3xl transition-all"
                                        style={{ touchAction: 'manipulation', background: 'rgba(0,240,255,0.05)', border: '1.5px solid rgba(0,240,255,0.12)' }}
                                    >
                                        <span className="text-lg mb-1">{opt.icon}</span>
                                        <span className="text-xl font-black text-white">{opt.l}</span>
                                        <span className="text-[9px] text-white/25 uppercase tracking-widest mt-1">{opt.sub}</span>
                                    </motion.button>
                                ))}
                            </div>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="w-full">
                                <div className="rounded-3xl p-5 text-center"
                                    style={{ background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.15)' }}>
                                    <p className="text-[9px] text-white/25 uppercase tracking-widest font-black mb-3">🎯 Hedef Kelimen</p>
                                    <p className="text-[clamp(2rem,9vw,3.5rem)] font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 tracking-tight leading-none">
                                        {targetWord}
                                    </p>
                                </div>
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
                        <div className="flex flex-col items-center justify-center min-h-[100dvh] text-center px-4"
                            style={{
                                paddingTop: 'calc(6rem + env(safe-area-inset-top))',
                                paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))',
                            }}>
                            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="w-full max-w-sm">
                                <motion.p className="text-[10px] text-brand-cyan font-black uppercase tracking-[0.35em] mb-5"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                                    📢 Sen Anlatıcısın
                                </motion.p>
                                <motion.div className="rounded-3xl py-8 px-6 mb-5 text-center"
                                    style={{ background: 'rgba(0,240,255,0.05)', border: '1.5px solid rgba(0,240,255,0.18)' }}
                                    animate={{ boxShadow: ['0 0 30px rgba(0,240,255,0.08)', '0 0 50px rgba(0,240,255,0.18)', '0 0 30px rgba(0,240,255,0.08)'] }}
                                    transition={{ duration: 3, repeat: Infinity }}>
                                    <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest mb-3">🎯 Hedef Kelime</p>
                                    <h1 className="text-[clamp(2.5rem,12vw,5rem)] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 leading-none">
                                        {targetWord}
                                    </h1>
                                </motion.div>
                                <motion.div
                                    className="flex items-start gap-3 rounded-2xl p-4 text-left"
                                    style={{ background: 'rgba(255,0,85,0.08)', border: '1px dashed rgba(255,0,85,0.3)' }}
                                    animate={{ borderColor: ['rgba(255,0,85,0.3)', 'rgba(255,0,85,0.6)', 'rgba(255,0,85,0.3)'] }}
                                    transition={{ duration: 2.5, repeat: Infinity }}>
                                    <span className="text-brand-pink text-lg flex-shrink-0">⚠️</span>
                                    <div>
                                        <p className="text-brand-pink font-bold text-[10px] uppercase tracking-widest mb-1">Dikkat</p>
                                        <p className="text-white/40 text-sm leading-relaxed">Sabotajcının tuzaklarına düşme!</p>
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
                        <div className="flex flex-col items-center min-h-[100dvh] px-4"
                            style={{
                                paddingTop: 'calc(6rem + env(safe-area-inset-top))',
                                paddingBottom: 'calc(9rem + env(safe-area-inset-bottom))',
                            }}>
                            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="w-full max-w-sm flex flex-col items-center">
                                <motion.div className="inline-flex items-center gap-2 bg-brand-pink/10 border border-brand-pink/25 px-4 py-2 rounded-full mb-2"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-pink">🕵️ Sabotajcı</span>
                                </motion.div>
                                <p className="text-white/25 text-xs mb-1">
                                    Hedef: <span className="text-brand-pink font-black">{targetWord}</span>
                                </p>
                                <p className="text-white/20 text-[10px] mb-6 text-center">Anlatıcı bir kelimeni söylerse seç ve YANDI!</p>
                                <div className="flex flex-wrap gap-3 justify-center w-full mb-6">
                                    {saboteurWords.length > 0 ? saboteurWords.map((w, i) => (
                                        <motion.button key={i}
                                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.91 }}
                                            onClick={() => {
                                                vibrate(15);
                                                setSelectedWord(w === selectedWord ? null : w);
                                            }}
                                            className={`px-6 py-3.5 rounded-2xl font-bold text-lg border-2 transition-all duration-200 select-none
                                                ${selectedWord === w
                                                    ? 'bg-brand-pink text-white border-brand-pink scale-105'
                                                    : 'bg-brand-pink/10 text-brand-pink border-brand-pink/30 hover:bg-brand-pink/20'}`}
                                            style={selectedWord === w ? {
                                                boxShadow: '0 0 40px rgba(255,0,85,0.6)',
                                                touchAction: 'manipulation',
                                            } : { touchAction: 'manipulation' }}
                                        >
                                            💣 {w}
                                        </motion.button>
                                    )) : (
                                        <div className="flex flex-col items-center gap-2 py-6">
                                            <AnimatedDots />
                                            <p className="text-white/25 text-sm mt-2">Kelimeler yükleniyor...</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>

                        {/* YANDI button pinned to bottom */}
                        <div className="fixed left-4 right-4 z-[45]"
                            style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                            <AnimatePresence>
                                {selectedWord && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                                        className="mb-2 text-center">
                                        <span className="text-brand-pink/60 text-[10px] font-black uppercase tracking-widest">
                                            "{selectedWord}" seçildi
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <motion.button
                                whileTap={{ scale: selectedWord ? 0.94 : 1 }}
                                disabled={!selectedWord}
                                onClick={() => {
                                    if (selectedWord) {
                                        vibrate([60, 30, 180]);
                                        socket?.emit('trigger_sabotage', { roomCode, roundId, word: selectedWord });
                                        setSelectedWord(null);
                                    }
                                }}
                                className="w-full relative rounded-[2rem] overflow-hidden disabled:opacity-35 disabled:cursor-not-allowed"
                                style={{ touchAction: 'manipulation' }}
                            >
                                <motion.div
                                    className="absolute inset-0"
                                    animate={selectedWord ? { opacity: [0.85, 1, 0.85] } : { opacity: 1 }}
                                    transition={{ duration: 1.2, repeat: Infinity }}
                                    style={{
                                        background: 'linear-gradient(135deg, #FF0055 0%, #cc0033 100%)',
                                        boxShadow: selectedWord ? '0 20px 60px rgba(255,0,85,0.55), 0 0 0 1px rgba(255,255,255,0.15)' : 'none',
                                    }}
                                />
                                <div className="relative flex items-center justify-center gap-3 py-5">
                                    <span className="text-2xl">🔥</span>
                                    <span className="font-black text-2xl uppercase tracking-widest text-white">YANDI!</span>
                                    <span className="text-2xl">🔥</span>
                                </div>
                            </motion.button>
                        </div>

                        <NavButtons />
                        <ToastOverlay />
                    </>
                );
            }

            // Guesser view
            return (
                <>
                    <FloatingTimer />
                    <MiniScoreboard />
                    <div className="flex flex-col items-center min-h-[100dvh] px-4"
                        style={{
                            paddingTop: 'calc(6rem + env(safe-area-inset-top))',
                            paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))',
                        }}>
                        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-sm">
                            <motion.div className="inline-flex items-center gap-2 bg-brand-cyan/10 border border-brand-cyan/20 px-4 py-2 rounded-full mb-5"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-cyan">🔍 Tahminci</span>
                            </motion.div>
                            <p className="text-white/30 text-sm mb-6">Anlatıcıyı dinle — hedef kelimeyi bul!</p>

                            <div className="flex items-center justify-center gap-4 mb-7">
                                {[1, 2, 3].map(i => (
                                    <motion.div key={i} className="flex flex-col items-center gap-1">
                                        <motion.div
                                            className="w-5 h-5 rounded-full transition-all duration-500"
                                            style={{
                                                background: i <= guessesLeft ? '#00F0FF' : 'rgba(255,255,255,0.08)',
                                                boxShadow: i <= guessesLeft ? '0 0 16px rgba(0,240,255,0.8)' : 'none',
                                            }}
                                            animate={i <= guessesLeft ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                                        />
                                    </motion.div>
                                ))}
                                <span className="text-white/25 text-xs">{guessesLeft}/3 hak</span>
                            </div>

                            {wrongGuesses.length > 0 && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex flex-wrap gap-2 justify-center mb-5">
                                    {wrongGuesses.map((w, i) => (
                                        <span key={i} className="px-3 py-1 rounded-full text-xs font-bold text-white/30 line-through"
                                            style={{ background: 'rgba(255,0,85,0.08)', border: '1px solid rgba(255,0,85,0.15)' }}>
                                            {w}
                                        </span>
                                    ))}
                                </motion.div>
                            )}

                            {guessesLeft > 0 ? (
                                <div className="w-full rounded-3xl overflow-hidden"
                                    style={{ background: 'rgba(0,0,0,0.35)', border: '1.5px solid rgba(0,240,255,0.18)' }}>
                                    <div className="flex gap-0">
                                        <input
                                            className="flex-1 bg-transparent px-5 py-5 text-white placeholder-white/20 outline-none"
                                            style={{ fontSize: '16px' }}
                                            placeholder="Tahminini yaz..."
                                            value={guessInput}
                                            onChange={e => setGuessInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && guessInput.trim()) {
                                                    vibrate(10);
                                                    socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                                    setGuessInput('');
                                                    setGuessesLeft(p => p - 1);
                                                }
                                            }}
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="off"
                                            enterKeyHint="send"
                                        />
                                        <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            style={{ touchAction: 'manipulation' }}
                                            disabled={!guessInput.trim()}
                                            onClick={() => {
                                                if (guessInput.trim()) {
                                                    vibrate(10);
                                                    socket?.emit('submit_guess', { roomCode, roundId, guessWord: guessInput.trim() });
                                                    setGuessInput('');
                                                    setGuessesLeft(p => p - 1);
                                                }
                                            }}
                                            className="px-5 disabled:opacity-30 text-brand-cyan font-black text-sm uppercase tracking-wider transition-all disabled:cursor-not-allowed"
                                        >
                                            Tahmin
                                        </motion.button>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full rounded-3xl p-6 text-center"
                                    style={{ background: 'rgba(255,0,85,0.08)', border: '1px solid rgba(255,0,85,0.2)' }}>
                                    <div className="text-4xl mb-3">😵</div>
                                    <p className="text-brand-pink font-bold text-lg">Tahmin hakkın bitti!</p>
                                    <p className="text-white/25 text-sm mt-1">Sonuçları bekle...</p>
                                </div>
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
            <div className="flex flex-col min-h-[100dvh] px-4 relative"
                style={{
                    paddingTop: 'calc(5rem + env(safe-area-inset-top))',
                    paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
                }}>
                {/* Top bar */}
                <div className="fixed top-0 left-0 right-0 z-[50] flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-2xl border-b border-white/[0.05]"
                    style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
                    <motion.button whileTap={{ scale: 0.93 }}
                        style={{ touchAction: 'manipulation' }}
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider border border-white/10 transition-all min-h-[44px]">
                        <ArrowLeft className="w-4 h-4" /> Çık
                    </motion.button>
                    <div className="flex items-center gap-2">
                        <LanguageToggle />
                    </div>
                </div>

                {/* Room code + QR */}
                <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-5">
                    <p className="text-white/20 uppercase tracking-[0.5em] font-bold text-[9px] mb-2">Oda Kodu</p>
                    <div className="flex items-center justify-center gap-3">
                        <motion.h1
                            whileTap={{ scale: 0.96 }}
                            style={{ touchAction: 'manipulation' }}
                            onClick={() => {
                                navigator.clipboard.writeText(roomCode || '');
                                vibrate(10);
                                showToast('correct', '📋 Kopyalandı!', 2000);
                            }}
                            className="text-[clamp(2.5rem,11vw,5rem)] font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-brand-cyan via-blue-400 to-purple-500 cursor-pointer leading-none"
                        >
                            {roomCode}
                        </motion.h1>
                        <motion.button
                            whileTap={{ scale: 0.88 }}
                            style={{ touchAction: 'manipulation' }}
                            onClick={() => setIsQrOpen(true)}
                            className="bg-white/5 hover:bg-brand-cyan/10 border border-white/10 hover:border-brand-cyan/30 rounded-2xl p-3 transition-all min-w-[48px] min-h-[48px] flex items-center justify-center"
                        >
                            <QrCode className="w-5 h-5 text-white/40" />
                        </motion.button>
                    </div>
                    <motion.p className="text-white/15 text-[9px] uppercase tracking-widest mt-1.5 font-bold"
                        animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }}>
                        Tıkla &amp; Kopyala · QR ile Paylaş
                    </motion.p>
                </motion.div>

                {/* Main grid */}
                <div className="w-full max-w-5xl mx-auto flex flex-col md:grid md:grid-cols-12 gap-4">

                    {/* Players card */}
                    <NeonCard className="md:col-span-7">
                        <div className="flex items-center justify-between mb-4 border-b border-white/[0.07] pb-4">
                            <div className="flex items-center gap-2.5 text-white/50">
                                <Users className="w-4 h-4" />
                                <h2 className="text-xs font-black uppercase tracking-widest">Oyuncular</h2>
                            </div>
                            <span className="bg-brand-cyan/10 text-brand-cyan px-3 py-1 rounded-full text-[10px] font-black tracking-widest">
                                {players.length}/10
                            </span>
                        </div>
                        <div className="space-y-2">
                            <AnimatePresence>
                                {players.map(p => {
                                    const col = playerColor(p.name);
                                    const pts = scores.find(s => s.name === p.name)?.points ?? 0;
                                    const canKick = isActuallyHost && p.name !== username;
                                    return (
                                        <motion.div key={p.name}
                                            initial={{ opacity: 0, y: 12, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9, x: -20 }}
                                            className="flex items-center gap-3 rounded-2xl px-4 py-3"
                                            style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                                            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 select-none"
                                                style={{ background: `${col.main}18`, color: col.main, border: `1px solid ${col.main}28` }}>
                                                {p.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <span className="font-bold text-sm flex-1 tracking-wide leading-tight">
                                                {p.name}
                                                {p.name === username && (
                                                    <span className="text-[9px] ml-2 px-2 py-0.5 rounded-md uppercase tracking-widest font-black"
                                                        style={{ background: `${col.main}14`, color: col.main }}>
                                                        sen
                                                    </span>
                                                )}
                                                {isActuallyHost && p.name === username && (
                                                    <span className="text-[9px] ml-1 px-2 py-0.5 rounded-md uppercase tracking-widest font-black text-amber-400/70"
                                                        style={{ background: 'rgba(245,158,11,0.1)' }}>
                                                        host
                                                    </span>
                                                )}
                                            </span>
                                            {pts > 0 && (
                                                <motion.span key={pts}
                                                    initial={{ scale: 1.4 }} animate={{ scale: 1 }}
                                                    className="font-mono font-black text-sm px-2.5 py-1 rounded-xl shrink-0"
                                                    style={{ background: `${col.main}12`, color: col.main }}>
                                                    {pts}pt
                                                </motion.span>
                                            )}
                                            {canKick && (
                                                <motion.button
                                                    whileTap={{ scale: 0.85 }}
                                                    style={{ touchAction: 'manipulation' }}
                                                    onClick={() => kickPlayer(p.name)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-xl text-white/20 hover:text-brand-pink hover:bg-brand-pink/10 transition-colors shrink-0"
                                                >
                                                    <UserX className="w-3.5 h-3.5" />
                                                </motion.button>
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
                        </div>
                    </NeonCard>

                    {/* Right column */}
                    <div className="md:col-span-5 flex flex-col gap-4">
                        {isActuallyHost ? (
                            <NeonCard>
                                <div className="flex items-center gap-2.5 text-white/45 border-b border-white/[0.07] pb-4 mb-4">
                                    <Settings className="w-4 h-4" />
                                    <h3 className="text-xs font-black uppercase tracking-widest">Ayarlar</h3>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] text-white/35 mb-2 block font-black uppercase tracking-widest">Kategori</label>
                                        <select
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-brand-cyan/40 text-white transition-all appearance-none cursor-pointer"
                                            style={{ fontSize: '16px' }}
                                            value={category} onChange={e => setCategory(e.target.value)}>
                                            <option value="Rastgele">🎲 Rastgele</option>
                                            <option value="Animals & Nature">🦁 Hayvanlar & Doğa</option>
                                            <option value="Movies & Series">🎬 Film & Dizi</option>
                                            <option value="Technology & Science">💻 Teknoloji & Bilim</option>
                                            <option value="Everyday Objects">🪑 Günlük Eşyalar</option>
                                            <option value="History & Culture">🏛️ Tarih & Kültür</option>
                                            <option value="Food & Cooking">🍕 Yemek & Mutfak</option>
                                            <option value="Sports & Games">⚽ Spor & Oyunlar</option>
                                            <option value="Space & Astronomy">🚀 Uzay & Astronomi</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-white/35 mb-2 block font-black uppercase tracking-widest">Hedef Skor</label>
                                        <select
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-brand-pink/40 text-white transition-all appearance-none cursor-pointer"
                                            style={{ fontSize: '16px' }}
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
                            <NeonCard variant="secondary" className="flex flex-col justify-center items-center text-center p-6">
                                <AlertCircle className="w-8 h-8 text-brand-cyan mb-4 opacity-35" />
                                <h3 className="text-sm font-black mb-2 uppercase tracking-widest">{t('rulesTitle')}</h3>
                                <p className="text-white/45 text-sm leading-relaxed">{t('rulesText1')}</p>
                            </NeonCard>
                        )}

                        {isActuallyHost ? (
                            <Button size="xl"
                                className="w-full flex items-center justify-center gap-3 group"
                                style={{ boxShadow: '0 20px 50px rgba(0,240,255,0.3)' }}
                                onClick={() => {
                                    if (players.length < 1) { alert(t('needPlayersAlert')); return; }
                                    socket?.emit('start_game', { roomCode, language, category, targetScore });
                                }}
                                disabled={players.length < 1}>
                                <Gamepad2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                {t('startGame')}
                            </Button>
                        ) : (
                            <div className="rounded-3xl text-center py-5 border border-brand-cyan/15"
                                style={{ background: 'rgba(0,240,255,0.03)' }}>
                                <motion.p className="text-brand-cyan text-[10px] font-black uppercase tracking-widest"
                                    animate={{ opacity: [0.45, 1, 0.45] }} transition={{ duration: 2, repeat: Infinity }}>
                                    {t('waitingHost')}
                                </motion.p>
                            </div>
                        )}
                    </div>

                    {/* Lobby chat */}
                    <div className="md:col-span-12">
                        <NeonCard>
                            <div className="flex items-center gap-2.5 text-white/45 border-b border-white/[0.07] pb-4 mb-4">
                                <MessageSquare className="w-4 h-4" />
                                <h2 className="text-xs font-black uppercase tracking-widest">Sohbet</h2>
                            </div>
                            <div className="overflow-y-auto flex flex-col gap-2 mb-3 scroll-smooth-touch"
                                style={{ maxHeight: '160px', minHeight: '60px' }}>
                                {chatMessages.length === 0
                                    ? <p className="text-white/15 text-[10px] text-center py-4 uppercase tracking-widest">Oyun başlamadan konuşun...</p>
                                    : chatMessages.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.name === username ? 'items-end' : 'items-start'}`}>
                                            {(i === 0 || chatMessages[i - 1].name !== msg.name) && (
                                                <span className="text-[9px] font-bold mb-0.5 px-1" style={{ color: playerColor(msg.name).main }}>
                                                    {msg.name === username ? 'Sen' : msg.name}
                                                </span>
                                            )}
                                            <div className={`px-3 py-1.5 rounded-2xl text-sm max-w-[85%] break-words ${
                                                msg.name === username ? 'bg-brand-cyan/12 text-white rounded-tr-sm' : 'bg-white/[0.07] text-white/80 rounded-tl-sm'
                                            }`}>
                                                {msg.message}
                                            </div>
                                        </div>
                                    ))
                                }
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/20 outline-none focus:border-brand-cyan/40 transition-colors"
                                    style={{ fontSize: '16px' }}
                                    placeholder="Mesaj yaz..."
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                                    maxLength={200}
                                    autoComplete="off"
                                    autoCorrect="off"
                                />
                                <motion.button
                                    whileTap={{ scale: 0.88 }}
                                    style={{ touchAction: 'manipulation' }}
                                    onClick={sendChat}
                                    disabled={!chatInput.trim()}
                                    className="bg-brand-cyan/10 hover:bg-brand-cyan/20 disabled:opacity-30 text-brand-cyan px-4 py-3 rounded-2xl transition-colors border border-brand-cyan/20 min-w-[48px] flex items-center justify-center"
                                >
                                    <Send className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </NeonCard>
                    </div>
                </div>

                <ToastOverlay />
            </div>
        );
    };

    // ─── Root ─────────────────────────────────────────────────────────────────
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
            <FlyingEmojiOverlay />
            <EmojiBar />
            <QrModal />
            <ChatPanel />
            {phase !== 'lobby' && <ChatButton />}
            {renderContent()}
        </>
    );
};
