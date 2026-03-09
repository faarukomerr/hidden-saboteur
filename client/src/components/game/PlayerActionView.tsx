import React from 'react';
import { motion } from 'framer-motion';
import { NeonCard } from '../ui/NeonCard';
import { YandiButton } from '../ui/YandiButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useLanguage } from '../../lib/i18n';

interface PlayerActionViewProps {
    role: 'guesser' | 'saboteur';
    onSabotage?: () => void;
    onGuess?: (guess: string) => void;
}

export const PlayerActionView: React.FC<PlayerActionViewProps> = ({ role, onSabotage, onGuess }) => {
    const [guess, setGuess] = React.useState('');
    const { t } = useLanguage();

    if (role === 'saboteur') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 w-full">
                <h2 className="text-2xl text-brand-pink font-bold uppercase tracking-[0.3em] mb-12">
                    {t('listenClosely')}
                </h2>

                <NeonCard variant="danger" className="w-full max-w-lg pt-12 pb-16">
                    <p className="text-white/70 mb-8 font-medium">
                        {t('didNarratorSay')}
                    </p>
                    <YandiButton onTrigger={onSabotage!} />
                </NeonCard>
            </div>
        );
    }

    // Guesser View
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 w-full max-w-md mx-auto">
            <h2 className="text-2xl text-brand-cyan font-bold uppercase tracking-[0.3em] mb-8">
                {t('youAreGuesser')}
            </h2>

            <NeonCard variant="secondary" className="w-full">
                <p className="text-white/70 mb-6 font-medium">
                    {t('listenAndGuess')}
                </p>

                <div className="flex gap-2">
                    <Input
                        placeholder={t('typeGuess')}
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onGuess!(guess);
                                setGuess('');
                            }
                        }}
                    />
                    <Button
                        className="flex-shrink-0"
                        onClick={() => {
                            onGuess!(guess);
                            setGuess('');
                        }}
                    >
                        {t('guessBtn')}
                    </Button>
                </div>
            </NeonCard>
        </div>
    );
};
