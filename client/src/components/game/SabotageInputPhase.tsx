import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { NeonCard } from '../ui/NeonCard';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useSocket } from '../../lib/SocketContext';
import { useLanguage } from '../../lib/i18n';

interface SabotagePhaseProps {
    roomCode: string;
    roundId: string;
}

export const SabotageInputPhase: React.FC<SabotagePhaseProps> = ({ roomCode, roundId }) => {
    const [words, setWords] = useState(['', '', '']);
    const [submitted, setSubmitted] = useState(false);
    const { socket } = useSocket();
    const { t } = useLanguage();

    const handleWordChange = (index: number, value: string) => {
        const newWords = [...words];
        newWords[index] = value;
        setWords(newWords);
    };

    const handleSubmit = () => {
        const validWords = words.filter(w => w.trim().length > 0);
        if (validWords.length === 0) return alert(t('enterWordAlert'));

        socket?.emit('submit_sabotage', { roomCode, roundId, words: validWords });
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                >
                    <div className="text-6xl mb-6">🤫</div>
                    <h2 className="text-3xl font-black uppercase text-brand-pink tracking-widest mb-4">{t('wordsLocked')}</h2>
                    <p className="text-white/60">{t('waitingSaboteurs')}</p>
                </motion.div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md mx-auto"
        >
            <div className="text-center mb-8">
                <h2 className="text-3xl font-black uppercase tracking-widest text-brand-cyan drop-shadow-[0_0_15px_rgba(0,240,255,0.5)]">
                    {t('setTraps')}
                </h2>
                <p className="mt-2 text-white/70">{t('setTrapsDesc')}</p>
            </div>

            <NeonCard variant="danger">
                <div className="space-y-4">
                    {words.map((word, idx) => (
                        <Input
                            key={idx}
                            placeholder={`${t('forbiddenWord')} ${idx + 1}`}
                            value={word}
                            onChange={(e) => handleWordChange(idx, e.target.value)}
                            className="text-center font-bold tracking-wider"
                            maxLength={20}
                        />
                    ))}

                    <Button
                        className="w-full mt-4"
                        size="lg"
                        variant="danger"
                        onClick={handleSubmit}
                        disabled={words.every(w => w.trim().length === 0)}
                    >
                        {t('lockWords')}
                    </Button>
                </div>
            </NeonCard>
        </motion.div>
    );
};
