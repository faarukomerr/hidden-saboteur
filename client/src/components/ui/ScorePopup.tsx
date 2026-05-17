import { useEffect } from 'react';
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
    <div className="fixed top-24 right-3 z-[90] flex flex-col items-end gap-2 pointer-events-none"
        style={{ top: 'calc(5.5rem + env(safe-area-inset-top))' }}>
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
            className="flex items-center gap-2 px-5 py-3 rounded-full backdrop-blur-sm"
            style={{
                background: 'rgba(0,240,255,0.15)',
                border: '1px solid rgba(0,240,255,0.35)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
            initial={{ x: 70, opacity: 0, scale: 0.5 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 55, opacity: 0, y: -14, scale: 0.75 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }}
        >
            <span
                className="font-black text-2xl text-brand-cyan tabular-nums leading-none"
                style={{ textShadow: '0 0 16px rgba(0,240,255,0.95)' }}
            >
                +{popup.points}
            </span>
            <span className="text-white/40 text-[9px] font-black uppercase tracking-wider">pt</span>
        </motion.div>
    );
};
