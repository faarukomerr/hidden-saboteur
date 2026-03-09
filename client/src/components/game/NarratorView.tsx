import React from 'react';
import { motion } from 'framer-motion';
import { NeonCard } from '../ui/NeonCard';
import { useLanguage } from '../../lib/i18n';

interface NarratorViewProps {
    targetWord: string;
}

export const NarratorView: React.FC<NarratorViewProps> = ({ targetWord }) => {
    const { t } = useLanguage();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.5 }}
            >
                <p className="text-xl text-brand-cyan font-bold uppercase tracking-[0.3em] mb-4 animate-pulse">
                    {t('youAreNarrator')}
                </p>

                <NeonCard className="py-12 px-8 mb-8">
                    <p className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4">{t('targetWord')}</p>
                    <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]">
                        {targetWord}
                    </h1>
                </NeonCard>

                <div className="bg-brand-pink/20 border border-brand-pink border-dashed rounded-2xl p-6 max-w-md mx-auto">
                    <h3 className="text-brand-pink font-bold uppercase tracking-widest mb-2">{t('warning')}</h3>
                    <p className="text-white/80">
                        {t('narratorWarningDesc')}
                    </p>
                </div>
            </motion.div>
        </div>
    );
};
