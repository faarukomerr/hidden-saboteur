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
    const baseClasses = "relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 shadow-2xl";

    const variants = {
        primary: "shadow-[0_0_30px_rgba(45,10,49,0.5)] border-brand-purple/50",
        secondary: "shadow-[0_0_30px_rgba(0,240,255,0.2)] border-brand-cyan/30",
        danger: "shadow-[0_0_30px_rgba(255,0,85,0.2)] border-brand-pink/40"
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
