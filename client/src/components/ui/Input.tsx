import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-sm font-semibold text-white/80 mb-2 uppercase tracking-wide">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    className={cn(
                        "w-full bg-black/20 border-t-white/10 border-l-white/5 border-white/5 rounded-2xl px-5 py-4 text-white placeholder:text-white/30",
                        "focus:outline-none focus:border-brand-cyan/50 focus:bg-white/10 focus:ring-4 focus:ring-brand-cyan/20 transition-all text-base min-h-[48px] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] backdrop-blur-xl",
                        error && "border-brand-pink focus:border-brand-pink focus:ring-brand-pink/20",
                        className
                    )}
                    {...props}
                />
                {error && (
                    <p className="mt-2 text-sm text-brand-pink uppercase tracking-wide font-medium">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = "Input";
