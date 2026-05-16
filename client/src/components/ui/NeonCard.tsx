import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';

interface NeonCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'danger';
}

export const NeonCard: React.FC<NeonCardProps> = ({
    children,
    variant = 'primary',
    className,
    ...props
}) => {
    const baseClasses = "relative overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-3xl p-5 md:p-8 shadow-2xl backdrop-saturate-150 transition-all";

    const variants = {
        primary: "shadow-[0_8px_32px_rgba(45,10,49,0.7),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-purple/40",
        secondary: "shadow-[0_8px_32px_rgba(0,240,255,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-cyan/20",
        danger: "shadow-[0_8px_32px_rgba(255,0,85,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-pink/30"
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(baseClasses, variants[variant], className)}
            {...props}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            <div className="relative z-10 w-full">
                {children}
            </div>
        </motion.div>
    );
};
