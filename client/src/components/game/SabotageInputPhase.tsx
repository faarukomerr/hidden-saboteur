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
    targetWord: string; // Saboteur now sees the target word!
}

export const SabotageInputPhase: React.FC<SabotagePhaseProps> = ({ roomCode, roundId, targetWord }) => {
    const [words, setWords] = useState(['', '', '']);
    const [submitted, setSubmitted] = useState(false);
    const [submittedWords, setSubmittedWords] = useState<string[]>([]);
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
        setSubmittedWords(validWords);
        setSubmitted(true);
    };

    // After submitting — show the submitted words + the secret word they need to protect
    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center w-full max-w-sm">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full space-y-6"
                >
                    <div className="text-6xl mb-2">🤫</div>
                    <h2 className="text-3xl font-black uppercase text-brand-pink tracking-widest">{t('wordsLocked')}</h2>

                    {/* Show the target word they know */}
                    <NeonCard variant="danger" className="text-left">
                        <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-1">🎯 Hedef Kelime (Gizli)</p>
                        <p className="text-3xl font-black text-brand-pink">{targetWord}</p>
                    </NeonCard>

                    {/* Show the trap words they planted */}
                    <NeonCard>
                        <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">🔥 Kurduğun Tuzaklar</p>
                        <div className="space-y-2">
                            {submittedWords.map((w, i) => (
                                <div key={i} className="bg-brand-pink/20 border border-brand-pink/40 rounded-xl px-4 py-2 font-bold text-brand-pink">
                                    {w}
                                </div>
                            ))}
                        </div>
                    </NeonCard>

                    <p className="text-white/50 text-sm animate-pulse">{t('waitingSaboteurs')}</p>
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
            {/* Show the secret target word to lure the Narrator into saying it */}
            <div className="text-center mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">🎯 Gizli Hedef Kelime</p>
                <div className="inline-block px-8 py-4 bg-brand-pink/20 border border-brand-pink rounded-2xl">
                    <h1 className="text-5xl font-black text-brand-pink tracking-wider">{targetWord}</h1>
                </div>
                <p className="mt-3 text-white/60 text-sm">Anlatıcı bu kelimeyi söylerse YANDI! de.</p>
            </div>

            <div className="text-center mb-6">
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
