import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cog, Zap, Shield, Cpu, Wifi } from 'lucide-react';

// ─── Change this date to set the countdown target ───────────────────────────
const LAUNCH_DATE = new Date('2026-05-17T15:28:17Z');

function useCountdown(target: Date) {
    const calc = () => {
        const diff = target.getTime() - Date.now();
        if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
        return {
            days: Math.floor(diff / 86400000),
            hours: Math.floor((diff % 86400000) / 3600000),
            minutes: Math.floor((diff % 3600000) / 60000),
            seconds: Math.floor((diff % 60000) / 1000),
        };
    };
    const [time, setTime] = useState(calc);
    useEffect(() => {
        const id = setInterval(() => setTime(calc()), 1000);
        return () => clearInterval(id);
    }, []);
    return time;
}

const MESSAGES = [
    'Deploying critical updates...',
    'Tuning the AI engine...',
    'Polishing the sabotage system...',
    'Almost there. Stay sharp.',
    'Reloading reality...',
];

function useTypingMessage(messages: string[]) {
    const [msgIdx, setMsgIdx] = useState(0);
    const [displayed, setDisplayed] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    useEffect(() => {
        const full = messages[msgIdx];
        let t: ReturnType<typeof setTimeout>;
        if (!isDeleting) {
            if (displayed.length < full.length) {
                t = setTimeout(() => setDisplayed(full.slice(0, displayed.length + 1)), 65);
            } else {
                t = setTimeout(() => setIsDeleting(true), 2200);
            }
        } else {
            if (displayed.length > 0) {
                t = setTimeout(() => setDisplayed(d => d.slice(0, -1)), 32);
            } else {
                setIsDeleting(false);
                setMsgIdx(i => (i + 1) % messages.length);
            }
        }
        return () => clearTimeout(t);
    }, [displayed, isDeleting, msgIdx, messages]);
    return displayed;
}

const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: `${(i * 37 + 11) % 100}%`,
    top: `${(i * 53 + 7) % 100}%`,
    size: (i % 3) + 1,
    duration: 3.5 + (i % 5),
    delay: (i * 0.38) % 4.5,
}));

const STATUS_ITEMS = [
    { label: 'Socket Engine', icon: Wifi, pink: false },
    { label: 'AI Service', icon: Cpu, pink: true },
    { label: 'Game Engine', icon: Shield, pink: false },
];

function Digit({ value, label }: { value: number; label: string }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <motion.div
                key={value}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="relative"
            >
                <div className="absolute inset-0 bg-brand-cyan/20 rounded-xl blur-lg" />
                <div className="relative bg-white/5 border border-white/10 rounded-xl px-4 py-3 min-w-[60px] text-center backdrop-blur-sm">
                    <span className="font-black text-3xl md:text-4xl tabular-nums text-brand-cyan"
                        style={{ textShadow: '0 0 18px rgba(0,240,255,0.9)' }}>
                        {String(value).padStart(2, '0')}
                    </span>
                </div>
            </motion.div>
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30">{label}</span>
        </div>
    );
}

export const MaintenancePage = () => {
    const { days, hours, minutes, seconds } = useCountdown(LAUNCH_DATE);
    const typingText = useTypingMessage(MESSAGES);

    return (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] p-6 relative overflow-hidden select-none">

            {/* Scanlines */}
            <div
                className="pointer-events-none absolute inset-0 z-10 opacity-[0.025]"
                style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,1) 2px, rgba(0,240,255,1) 3px)' }}
            />

            {/* Vignette */}
            <div
                className="pointer-events-none absolute inset-0 z-10"
                style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)' }}
            />

            {/* Floating particles */}
            {PARTICLES.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full bg-brand-cyan pointer-events-none"
                    style={{ left: p.left, top: p.top, width: p.size, height: p.size }}
                    animate={{ opacity: [0, 0.5, 0], y: [-12, 12] }}
                    transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
                />
            ))}

            {/* Ambient glow */}
            <div className="pointer-events-none absolute inset-0">
                <motion.div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.07) 0%, transparent 70%)' }}
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(255,0,85,0.04) 0%, transparent 70%)' }}
                />
            </div>

            {/* Blinking status badge */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 bg-brand-pink/10 border border-brand-pink/30 px-4 py-1.5 rounded-full mb-10 relative z-20"
            >
                <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-brand-pink"
                    animate={{ opacity: [1, 0.1, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                />
                <span className="text-[10px] font-black uppercase tracking-[0.35em] text-brand-pink">System Offline</span>
            </motion.div>

            {/* ── Gear cluster ── */}
            <motion.div
                initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 1, type: 'spring', bounce: 0.4 }}
                className="relative w-44 h-44 mb-10 z-20"
            >
                {/* Pulsing rings */}
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        className="absolute inset-0 rounded-full border border-brand-cyan/25"
                        animate={{ scale: [1, 2.2 + i * 0.3], opacity: [0.6, 0] }}
                        transition={{ duration: 2.8, delay: i * 0.9, repeat: Infinity, ease: 'easeOut' }}
                    />
                ))}

                {/* Glow backing */}
                <div className="absolute inset-0 rounded-full scale-150 blur-3xl"
                    style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.12) 0%, transparent 70%)' }}
                />

                {/* Big center gear */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                        style={{ filter: 'drop-shadow(0 0 22px rgba(0,240,255,1))' }}
                    >
                        <Cog className="w-28 h-28 text-brand-cyan" strokeWidth={1.2} />
                    </motion.div>
                </div>

                {/* Small gear — top-right, counter-rotating */}
                <div className="absolute -top-3 -right-2">
                    <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                        style={{ filter: 'drop-shadow(0 0 10px rgba(255,0,85,0.85))' }}
                    >
                        <Cog className="w-11 h-11 text-brand-pink" strokeWidth={1.4} />
                    </motion.div>
                </div>

                {/* Tiny gear — bottom-left */}
                <div className="absolute -bottom-1 -left-4">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                        style={{ filter: 'drop-shadow(0 0 7px rgba(0,240,255,0.6))' }}
                    >
                        <Cog className="w-7 h-7 text-brand-cyan/60" strokeWidth={1.5} />
                    </motion.div>
                </div>
            </motion.div>

            {/* Title */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="text-center mb-3 relative z-20"
            >
                <h1 className="text-[clamp(2.8rem,11vw,5.5rem)] font-black italic tracking-tighter leading-[0.9] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">
                    HIDDEN
                    <br />
                    <span className="not-italic"
                        style={{ color: '#00F0FF', textShadow: '0 0 50px rgba(0,240,255,0.8), 0 0 100px rgba(0,240,255,0.3)' }}>
                        SABOTEUR
                    </span>
                </h1>
            </motion.div>

            {/* Glitch subtitle */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="relative mb-10 z-20 h-5"
            >
                {/* Pink glitch ghost */}
                <motion.span
                    className="absolute inset-0 text-center font-black uppercase tracking-[0.5em] text-brand-pink/35"
                    style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.8rem)' }}
                    animate={{ x: [-3, 3, -1, 0], opacity: [0.35, 0.7, 0.35] }}
                    transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 3.2 }}
                >
                    — UNDER MAINTENANCE —
                </motion.span>
                {/* Cyan glitch ghost */}
                <motion.span
                    className="absolute inset-0 text-center font-black uppercase tracking-[0.5em] text-brand-cyan/25"
                    style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.8rem)' }}
                    animate={{ x: [3, -3, 1, 0], opacity: [0.25, 0.5, 0.25] }}
                    transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 3.2, delay: 0.04 }}
                >
                    — UNDER MAINTENANCE —
                </motion.span>
                {/* Real text */}
                <span className="relative font-black uppercase tracking-[0.5em] text-white/40"
                    style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.8rem)' }}>
                    — UNDER MAINTENANCE —
                </span>
            </motion.div>

            {/* System status bars */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="w-full max-w-xs space-y-3 mb-10 z-20"
            >
                {STATUS_ITEMS.map((item, i) => (
                    <div key={item.label} className="flex items-center gap-3">
                        <item.icon className="w-3 h-3 text-white/25 flex-shrink-0" />
                        <div className="flex-1">
                            <div className="flex justify-between mb-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">{item.label}</span>
                                <span className="text-[9px] font-bold text-white/20">UPDATING</span>
                            </div>
                            <div className="h-px rounded-full bg-white/[0.06] overflow-hidden">
                                <motion.div
                                    className="h-full rounded-full"
                                    style={{
                                        background: item.pink ? '#FF0055' : '#00F0FF',
                                        boxShadow: item.pink ? '0 0 8px rgba(255,0,85,0.7)' : '0 0 8px rgba(0,240,255,0.7)',
                                    }}
                                    animate={{ width: ['12%', '48%', '25%', '70%', '38%', '85%', '45%'] }}
                                    transition={{ duration: 7 + i * 1.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.9 }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </motion.div>

            {/* Typing message */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mb-10 z-20 h-5 flex items-center"
            >
                <span className="text-[11px] font-mono tracking-wider"
                    style={{ color: 'rgba(0,240,255,0.55)' }}>
                    {typingText}
                    <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.55, repeat: Infinity }}
                        className="ml-px"
                    >▋</motion.span>
                </span>
            </motion.div>

            {/* Countdown */}
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65, duration: 0.8 }}
                className="flex items-start gap-3 md:gap-4 mb-10 z-20"
            >
                <Digit value={days} label="Days" />
                <span className="text-brand-cyan/25 text-2xl font-black mt-[14px] leading-none">:</span>
                <Digit value={hours} label="Hours" />
                <span className="text-brand-cyan/25 text-2xl font-black mt-[14px] leading-none">:</span>
                <Digit value={minutes} label="Min" />
                <span className="text-brand-cyan/25 text-2xl font-black mt-[14px] leading-none">:</span>
                <Digit value={seconds} label="Sec" />
            </motion.div>

            {/* Footer */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="flex items-center gap-2 text-white/10 text-[9px] font-bold uppercase tracking-[0.3em] z-20"
            >
                <Zap className="w-3 h-3" />
                <span>Real-Time · AI-Powered · Party Game</span>
            </motion.div>
        </div>
    );
};
