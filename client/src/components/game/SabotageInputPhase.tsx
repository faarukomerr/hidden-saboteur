import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertTriangle } from 'lucide-react';
import { useSocket } from '../../lib/SocketContext';
import { useLanguage } from '../../lib/i18n';

interface Props {
    roomCode: string;
    roundId: string;
    targetWord: string;
}

const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch (_) {} };

export const SabotageInputPhase = ({ roomCode, roundId, targetWord }: Props) => {
    const [words, setWords] = useState(['', '', '']);
    const [submitted, setSubmitted] = useState(false);
    const [submittedWords, setSubmittedWords] = useState<string[]>([]);
    const [focused, setFocused] = useState<number | null>(null);
    const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
    const { socket } = useSocket();
    const { t } = useLanguage();

    const handleChange = (i: number, v: string) => {
        const next = [...words];
        next[i] = v;
        setWords(next);
    };

    const handleSubmit = () => {
        const valid = words.filter(w => w.trim().length > 0);
        if (valid.length === 0) return;
        vibrate([60, 40, 120]);
        socket?.emit('submit_sabotage', { roomCode, roundId, words: valid });
        setSubmittedWords(valid);
        setSubmitted(true);
    };

    const validCount = words.filter(w => w.trim().length > 0).length;

    // ── Submitted state ───────────────────────────────────────────────────────
    if (submitted) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', bounce: 0.4 }}
                className="w-full max-w-sm mx-auto flex flex-col items-center text-center gap-5"
            >
                {/* Big confirmation icon */}
                <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', bounce: 0.55, delay: 0.1 }}
                    className="text-[72px] leading-none select-none"
                >
                    🤫
                </motion.div>

                <div>
                    <h2 className="text-2xl font-black uppercase tracking-widest text-brand-pink mb-1">
                        Tuzaklar Kuruldu
                    </h2>
                    <p className="text-white/30 text-xs uppercase tracking-widest">Anlatıcıyı izle...</p>
                </div>

                {/* Target word reminder */}
                <div className="w-full rounded-3xl p-4 text-center"
                    style={{ background: 'rgba(255,0,85,0.08)', border: '1px solid rgba(255,0,85,0.25)' }}>
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-brand-pink/50 mb-2">🎯 Hedef Kelime</p>
                    <p className="text-3xl font-black text-brand-pink tracking-wide">{targetWord}</p>
                </div>

                {/* Trap words */}
                <div className="w-full">
                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/25 mb-3">🔒 Aktif Tuzakların</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {submittedWords.map((w, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.7, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ delay: i * 0.12, type: 'spring', bounce: 0.4 }}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-brand-pink text-base"
                                style={{
                                    background: 'rgba(255,0,85,0.12)',
                                    border: '1px solid rgba(255,0,85,0.35)',
                                    boxShadow: '0 0 16px rgba(255,0,85,0.15)',
                                }}
                            >
                                <span className="text-[10px] opacity-50">💣</span>
                                {w}
                            </motion.div>
                        ))}
                    </div>
                </div>

                <motion.p
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-white/30 text-xs uppercase tracking-widest"
                >
                    {t('waitingSaboteurs')}
                </motion.p>
            </motion.div>
        );
    }

    // ── Input state ───────────────────────────────────────────────────────────
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm mx-auto flex flex-col gap-5"
        >
            {/* Target word — dramatic display */}
            <div className="text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.45em] text-brand-pink/50 mb-3">
                    🎯 Gizli Hedef Kelime
                </p>
                <motion.div
                    animate={{
                        boxShadow: [
                            '0 0 30px rgba(255,0,85,0.2)',
                            '0 0 60px rgba(255,0,85,0.45)',
                            '0 0 30px rgba(255,0,85,0.2)',
                        ],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="relative inline-block px-8 py-5 rounded-3xl"
                    style={{
                        background: 'rgba(255,0,85,0.1)',
                        border: '1.5px solid rgba(255,0,85,0.4)',
                    }}
                >
                    <div className="absolute inset-0 rounded-3xl blur-2xl opacity-25"
                        style={{ background: '#FF0055' }} />
                    <h1 className="relative text-[clamp(2.2rem,10vw,3.5rem)] font-black text-brand-pink tracking-wider leading-none">
                        {targetWord}
                    </h1>
                </motion.div>
                <p className="mt-3 text-white/35 text-xs">
                    Anlatıcı bu kelimeyi söylerse → <span className="text-brand-pink font-bold">YANDI!</span>
                </p>
            </div>

            {/* Warning banner */}
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-amber-400/80 text-xs leading-relaxed">
                    {t('setTrapsDesc')}
                </p>
            </div>

            {/* Trap word inputs */}
            <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 text-center">
                    🔒 Yasaklı Kelimeleri Gir
                </p>
                {words.map((word, i) => (
                    <motion.div
                        key={i}
                        animate={focused === i ? {
                            boxShadow: '0 0 0 2px rgba(255,0,85,0.5), 0 0 30px rgba(255,0,85,0.15)',
                        } : {
                            boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
                        }}
                        className="relative flex items-center rounded-2xl overflow-hidden"
                        style={{ background: 'rgba(0,0,0,0.35)' }}
                    >
                        {/* Slot number */}
                        <div className="flex items-center justify-center w-12 h-full border-r flex-shrink-0 py-4"
                            style={{
                                borderColor: word.trim() ? 'rgba(255,0,85,0.3)' : 'rgba(255,255,255,0.06)',
                            }}>
                            <span className="font-black text-xs"
                                style={{ color: word.trim() ? '#FF0055' : 'rgba(255,255,255,0.2)' }}>
                                {word.trim() ? '💣' : `0${i + 1}`}
                            </span>
                        </div>

                        <input
                            ref={inputRefs[i]}
                            value={word}
                            onChange={e => handleChange(i, e.target.value)}
                            onFocus={() => setFocused(i)}
                            onBlur={() => setFocused(null)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && i < 2) inputRefs[i + 1].current?.focus();
                                if (e.key === 'Enter' && i === 2) handleSubmit();
                            }}
                            placeholder={`Yasaklı kelime ${i + 1}`}
                            maxLength={20}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            enterKeyHint={i < 2 ? 'next' : 'done'}
                            className="flex-1 bg-transparent px-4 py-4 text-white placeholder-white/20 outline-none text-base font-medium"
                            style={{ fontSize: '16px' }}
                        />

                        {/* Clear button */}
                        <AnimatePresence>
                            {word.trim() && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                    onClick={() => handleChange(i, '')}
                                    className="w-10 flex items-center justify-center text-white/25 hover:text-white/60 transition-colors flex-shrink-0"
                                    style={{ touchAction: 'manipulation' }}
                                >
                                    ×
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ))}
            </div>

            {/* Progress indicator */}
            <div className="flex gap-2 justify-center">
                {[0, 1, 2].map(i => (
                    <motion.div
                        key={i}
                        animate={{
                            background: words[i].trim()
                                ? '#FF0055'
                                : 'rgba(255,255,255,0.1)',
                            boxShadow: words[i].trim()
                                ? '0 0 10px rgba(255,0,85,0.6)'
                                : 'none',
                        }}
                        className="h-1 rounded-full flex-1"
                        transition={{ duration: 0.2 }}
                    />
                ))}
            </div>

            {/* Submit button */}
            <motion.button
                whileTap={{ scale: validCount > 0 ? 0.96 : 1 }}
                onClick={handleSubmit}
                disabled={validCount === 0}
                style={{ touchAction: 'manipulation' }}
                className="w-full relative rounded-3xl overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <motion.div
                    className="absolute inset-0"
                    animate={validCount > 0 ? {
                        opacity: [0.8, 1, 0.8],
                    } : { opacity: 1 }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    style={{
                        background: 'linear-gradient(135deg, #FF0055 0%, #cc0044 100%)',
                        boxShadow: validCount > 0 ? '0 15px 40px rgba(255,0,85,0.45)' : 'none',
                    }}
                />
                <div className="relative flex items-center justify-center gap-3 py-5 px-6">
                    <Lock className="w-5 h-5 text-white" />
                    <span className="font-black text-lg uppercase tracking-widest text-white">
                        Tuzağı Kur {validCount > 0 && `(${validCount})`}
                    </span>
                </div>
            </motion.button>
        </motion.div>
    );
};
