import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ScorePopupItem {
    id: string;
    points: number;
}

interface Props {
    popups: ScorePopupItem[];
    onRemove: (id: string) => void;
}

export const ScorePopup = ({ popups, onRemove }: Props) => (
    <div className="fixed top-1/3 right-4 z-[90] flex flex-col items-end gap-2 pointer-events-none">
        <AnimatePresence>
            {popups.map(p => (
                <PopupItem key={p.id} popup={p} onComplete={() => onRemove(p.id)} />
            ))}
        </AnimatePresence>
    </div>
);

const PopupItem = ({ popup, onComplete }: { popup: ScorePopupItem; onComplete: () => void }) => {
    useEffect(() => {
        const t = setTimeout(onComplete, 1800);
        return () => clearTimeout(t);
    }, [onComplete]);

    return (
        <motion.div
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-cyan/20 border border-brand-cyan/40 backdrop-blur-sm"
            initial={{ x: 60, opacity: 0, scale: 0.6 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 50, opacity: 0, y: -12, scale: 0.8 }}
            transition={{ type: 'spring', bounce: 0.5 }}
        >
            <span
                className="font-black text-2xl text-brand-cyan tabular-nums"
                style={{ textShadow: '0 0 14px rgba(0,240,255,0.9)' }}
            >
                +{popup.points}
            </span>
            <span className="text-white/40 text-[10px] font-black uppercase tracking-wider">puan</span>
        </motion.div>
    );
};
