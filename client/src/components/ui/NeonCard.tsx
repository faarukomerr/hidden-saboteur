import React, { useRef } from 'react';
import { motion, HTMLMotionProps, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '../../lib/utils';

interface NeonCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'danger';
}

const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const NeonCard: React.FC<NeonCardProps> = ({
    children, variant = 'primary', className, ...props
}) => {
    const base = "relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 backdrop-blur-3xl p-4 sm:p-5 md:p-8 shadow-2xl backdrop-saturate-150 transition-colors";

    const variantClass = {
        primary: "shadow-[0_15px_40px_rgba(45,10,49,0.7),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-purple/40",
        secondary: "shadow-[0_15px_40px_rgba(0,240,255,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-cyan/20",
        danger: "shadow-[0_15px_40px_rgba(255,0,85,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-pink/30",
    };

    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const xSpring = useSpring(x, { stiffness: 300, damping: 20 });
    const ySpring = useSpring(y, { stiffness: 300, damping: 20 });
    const rotateX = useTransform(ySpring, [-0.5, 0.5], ['5deg', '-5deg']);
    const rotateY = useTransform(xSpring, [-0.5, 0.5], ['-5deg', '5deg']);

    const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current || isTouch) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
    };

    const onMouseLeave = () => { x.set(0); y.set(0); };

    const tiltStyle = isTouch ? {} : { rotateX, rotateY, transformStyle: 'preserve-3d' as const };

    return (
        <motion.div
            ref={ref}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            style={tiltStyle}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={cn(base, variantClass[variant], className)}
            {...props}
        >
            <div
                className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"
                style={isTouch ? {} : { transform: 'translateZ(1px)' }}
            />
            <div
                className="relative z-10 w-full"
                style={isTouch ? {} : { transform: 'translateZ(20px)' }}
            >
                {children}
            </div>
        </motion.div>
    );
};
