import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

interface Props {
    word: string;
    onComplete: () => void;
}

const SPARKS = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const d = 90 + (i % 5) * 40;
    return {
        id: i,
        x: Math.cos(angle) * d,
        y: Math.sin(angle) * d,
        em: ['🔥', '💥', '⚡', '✨', '🌟', '💫'][i % 6],
        delay: (i % 5) * 0.05,
        scale: 0.8 + (i % 3) * 0.4,
    };
});

export const YandiOverlay = ({ word, onComplete }: Props) => {
    useEffect(() => {
        const t = setTimeout(onComplete, 3200);
        return () => clearTimeout(t);
    }, [onComplete]);

    return (
        <motion.div
            className="fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
        >
            {/* Background */}
            <motion.div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at center, rgba(255,0,85,0.55) 0%, rgba(10,4,14,0.97) 68%)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.75] }}
                transition={{ duration: 0.35 }}
            />

            {/* Shockwave rings */}
            {[0, 1, 2].map(i => (
                <motion.div
                    key={i}
                    className="absolute rounded-full border-4 border-brand-pink"
                    style={{ width: 60, height: 60, opacity: 0.9 - i * 0.2 }}
                    animate={{ scale: [1, 14 + i * 4], opacity: [0.8 - i * 0.2, 0] }}
                    transition={{ duration: 0.85, delay: i * 0.1, ease: 'easeOut' }}
                />
            ))}

            {/* Sparks */}
            {SPARKS.map(s => (
                <motion.div
                    key={s.id}
                    className="absolute text-xl pointer-events-none select-none"
                    style={{ left: '50%', top: '50%', marginLeft: -12, marginTop: -12 }}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: s.x, y: s.y, scale: [0, s.scale * 1.5, s.scale * 0.7], opacity: [1, 1, 0] }}
                    transition={{ duration: 1.1, delay: s.delay, ease: 'easeOut' }}
                >
                    {s.em}
                </motion.div>
            ))}

            {/* YANDI! */}
            <motion.h1
                className="relative z-10 font-black italic select-none"
                style={{
                    fontSize: 'clamp(4rem, 22vw, 9rem)',
                    color: '#fff',
                    textShadow: '0 0 120px rgba(255,0,85,1), 0 0 60px rgba(255,0,85,0.9), 0 0 20px rgba(255,0,85,0.8)',
                }}
                initial={{ scale: 0.2, rotate: -14, opacity: 0 }}
                animate={{ scale: [0.2, 1.3, 1], rotate: [-14, 5, 0], opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.5, duration: 0.65 }}
            >
                YANDI!
            </motion.h1>

            {/* Caught word */}
            <motion.div
                className="z-10 mt-5 text-center"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.45 }}
            >
                <p className="text-white/40 text-[10px] uppercase tracking-[0.45em] font-black mb-3">
                    Yakalanan Kelime
                </p>
                <div className="inline-flex items-center px-7 py-3.5 rounded-2xl bg-white/10 border border-brand-pink/40 backdrop-blur-sm">
                    <span className="text-white font-black text-2xl tracking-widest">
                        "{word}"
                    </span>
                </div>
            </motion.div>
        </motion.div>
    );
};
