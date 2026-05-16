import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends HTMLMotionProps<"button"> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {

        const variants = {
            primary: "bg-brand-cyan text-brand-dark hover:bg-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.4)] border border-white/20",
            secondary: "bg-white/10 text-white hover:bg-white/20 border border-white/10 backdrop-blur-md",
            danger: "bg-brand-pink text-white hover:bg-pink-500 shadow-[0_0_20px_rgba(255,0,85,0.4)] border border-white/20",
            ghost: "bg-transparent text-white/70 hover:text-white hover:bg-white/10"
        };

        const sizes = {
            sm: "px-4 py-2 text-sm min-h-[40px]",
            md: "px-6 py-3 text-base font-semibold min-h-[48px]",
            lg: "px-8 py-4 text-lg font-bold uppercase tracking-wider min-h-[56px]",
            xl: "px-8 sm:px-12 py-5 sm:py-6 text-xl sm:text-2xl font-black uppercase tracking-widest rounded-full min-h-[64px]"
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: props.disabled ? 1 : 1.02 }}
                whileTap={{ scale: props.disabled ? 1 : 0.95 }}
                className={cn(
                    "inline-flex items-center justify-center rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 disabled:opacity-50 disabled:cursor-not-allowed",
                    variants[variant],
                    sizes[size],
                    className
                )}
                disabled={isLoading || props.disabled}
                {...props}
            >
                {isLoading && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                {children}
            </motion.button>
        );
    }
);

Button.displayName = "Button";
