import React, { useRef } from 'react';
import { motion, HTMLMotionProps, useMotionValue, useSpring, useTransform } from 'framer-motion';
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
    const baseClasses = "relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 backdrop-blur-3xl p-5 md:p-8 shadow-2xl backdrop-saturate-150 transition-colors";

    const variants = {
        primary: "shadow-[0_15px_40px_rgba(45,10,49,0.7),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-purple/40",
        secondary: "shadow-[0_15px_40px_rgba(0,240,255,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-cyan/20",
        danger: "shadow-[0_15px_40px_rgba(255,0,85,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)] border-t-white/20 border-l-white/10 border-brand-pink/30"
    };

    const ref = useRef<HTMLDivElement>(null);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x, { stiffness: 300, damping: 20 });
    const mouseYSpring = useSpring(y, { stiffness: 300, damping: 20 });

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["5deg", "-5deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-5deg", "5deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d"
            }}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn(baseClasses, variants[variant], className)}
            {...props}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" style={{ transform: "translateZ(1px)" }} />
            <div className="relative z-10 w-full" style={{ transform: "translateZ(20px)" }}>
                {children}
            </div>
        </motion.div>
    );
};
