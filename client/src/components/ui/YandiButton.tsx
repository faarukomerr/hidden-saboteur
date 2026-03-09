import React from 'react';
import { motion } from 'framer-motion';

interface YandiButtonProps {
    onTrigger: () => void;
    disabled?: boolean;
}

export const YandiButton: React.FC<YandiButtonProps> = ({ onTrigger, disabled }) => {
    return (
        <div className="relative w-full max-w-sm mx-auto group">
            {/* Outer Pulse */}
            {!disabled && (
                <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-brand-pink rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200 animate-pulse-fast"></div>
            )}

            <motion.button
                disabled={disabled}
                whileHover={{ scale: disabled ? 1 : 1.05, textShadow: "0px 0px 8px rgb(255,255,255)" }}
                whileTap={{ scale: disabled ? 1 : 0.85, rotate: -2 }}
                onClick={onTrigger}
                className={`relative w-full py-8 rounded-full 
          bg-gradient-to-r from-rose-600 via-red-500 to-brand-pink
          text-white text-5xl md:text-6xl font-black uppercase tracking-[0.2em]
          border-4 border-white/20 shadow-2xl transition-all
          ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:border-white/50 cursor-pointer'}
        `}
            >
                YANDI!

                {/* Inner glare */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
            </motion.button>
        </div>
    );
};
