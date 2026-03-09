import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../lib/i18n';

export const LanguageToggle = () => {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="absolute top-4 right-4 flex bg-black/40 backdrop-blur-md rounded-full border border-white/10 p-1 z-50">
            <button
                onClick={() => setLanguage('en')}
                className={`relative px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider transition-colors ${language === 'en' ? 'text-white' : 'text-white/40 hover:text-white/70'
                    }`}
            >
                {language === 'en' && (
                    <motion.div
                        layoutId="active-lang"
                        className="absolute inset-0 bg-brand-cyan/20 border border-brand-cyan rounded-full"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                )}
                <span className="relative z-10">EN</span>
            </button>

            <button
                onClick={() => setLanguage('tr')}
                className={`relative px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider transition-colors ${language === 'tr' ? 'text-white' : 'text-white/40 hover:text-white/70'
                    }`}
            >
                {language === 'tr' && (
                    <motion.div
                        layoutId="active-lang"
                        className="absolute inset-0 bg-brand-pink/20 border border-brand-pink rounded-full"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                )}
                <span className="relative z-10">TR</span>
            </button>
        </div>
    );
};
