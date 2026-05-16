import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

type Role = 'narrator' | 'saboteur' | 'guesser';

interface Props {
    role: Role;
    targetWord?: string | null;
    onComplete: () => void;
}

const CFG = {
    narrator: {
        icon: '📢',
        label: 'ANLATICIsın',
        desc: 'Kelimeyi anlat — ama sabotajcının tuzaklarına SAKIN düşme!',
        color: '#00F0FF',
        glow: 'rgba(0,240,255,0.32)',
    },
    saboteur: {
        icon: '🕵️',
        label: 'SABOTAJCIsın',
        desc: 'Anlatıcıyı dinle — yasaklı kelimeyi söyleyince YANDI! de!',
        color: '#FF0055',
        glow: 'rgba(255,0,85,0.32)',
    },
    guesser: {
        icon: '🔍',
        label: 'TAHMİNCİsin',
        desc: 'Anlatıcıyı dikkatle dinle ve hedef kelimeyi bul!',
        color: '#8B5CF6',
        glow: 'rgba(139,92,246,0.32)',
    },
};

export const RoleReveal = ({ role, targetWord, onComplete }: Props) => {
    const c = CFG[role];

    useEffect(() => {
        const t = setTimeout(onComplete, 4000);
        return () => clearTimeout(t);
    }, [onComplete]);

    return (
        <motion.div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
            style={{ background: '#120A17' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            {/* Radial glow */}
            <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 55%, ${c.glow} 0%, transparent 65%)` }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1.6 }}
                transition={{ duration: 1.3, ease: 'easeOut' }}
            />

            {/* Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.022]"
                style={{ background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, #fff 2px, #fff 3px)' }} />

            {/* Particles */}
            {Array.from({ length: 12 }, (_, i) => (
                <motion.div
                    key={i}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        left: `${(i * 41 + 8) % 95}%`,
                        top: `${(i * 67 + 12) % 90}%`,
                        width: (i % 3) + 1,
                        height: (i % 3) + 1,
                        background: c.color,
                    }}
                    animate={{ opacity: [0, 0.6, 0], y: [-8, 8] }}
                    transition={{ duration: 2 + (i % 3), delay: i * 0.25, repeat: Infinity, ease: 'easeInOut' }}
                />
            ))}

            {/* "Rolün" */}
            <motion.p
                className="z-10 text-[10px] font-black uppercase mb-8"
                style={{ color: `${c.color}55`, letterSpacing: '0.5em' }}
                initial={{ opacity: 0, letterSpacing: '1.5em' }}
                animate={{ opacity: 1, letterSpacing: '0.5em' }}
                transition={{ delay: 0.15, duration: 0.8 }}
            >
                — Rolün —
            </motion.p>

            {/* Icon */}
            <motion.div
                className="text-[76px] z-10 mb-3 select-none"
                initial={{ scale: 0.2, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.55, delay: 0.2 }}
            >
                {c.icon}
            </motion.div>

            {/* Role name */}
            <motion.h1
                className="z-10 font-black italic tracking-tighter text-center"
                style={{
                    fontSize: 'clamp(2.5rem, 11vw, 5.5rem)',
                    color: c.color,
                    textShadow: `0 0 80px ${c.glow}, 0 0 160px ${c.glow}`,
                }}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.35, delay: 0.3 }}
            >
                {c.label}
            </motion.h1>

            {/* Description */}
            <motion.p
                className="z-10 text-white/40 text-sm text-center px-10 mt-5 max-w-xs leading-relaxed"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.5 }}
            >
                {c.desc}
            </motion.p>

            {/* Target word — narrator & saboteur only */}
            {targetWord && role !== 'guesser' && (
                <motion.div
                    className="z-10 mt-8 flex flex-col items-center"
                    initial={{ opacity: 0, y: 18, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 1.5, type: 'spring', bounce: 0.3 }}
                >
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] mb-3"
                        style={{ color: `${c.color}50` }}>
                        Hedef Kelime
                    </p>
                    <div className="relative px-10 py-4 rounded-2xl"
                        style={{ background: `${c.color}10`, border: `1px solid ${c.color}30` }}>
                        <div className="absolute inset-0 rounded-2xl blur-2xl opacity-20"
                            style={{ background: c.color }} />
                        <span className="relative font-black tracking-widest"
                            style={{ fontSize: 'clamp(1.5rem, 6vw, 2.5rem)', color: c.color }}>
                            {targetWord}
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ background: `${c.color}15` }}>
                <motion.div
                    className="h-full"
                    style={{ background: c.color, boxShadow: `0 0 8px ${c.glow}` }}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 4, ease: 'linear' }}
                />
            </div>
        </motion.div>
    );
};
