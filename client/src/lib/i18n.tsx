import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'tr';

interface Translations {
    [key: string]: {
        [key in Language]: string;
    };
}

export const translations: Translations = {
    // Common
    loading: { en: 'Loading...', tr: 'Yükleniyor...' },
    serverOnline: { en: 'Server Online', tr: 'Sunucu Aktif' },
    connecting: { en: 'Connecting...', tr: 'Bağlanıyor...' },
    or: { en: 'OR', tr: 'VEYA' },

    // Home
    subtitle: { en: 'TRUST NO ONE. GUESS THE WORD.', tr: 'KİMSEYE GÜVENME. KELİMEYİ BİL.' },
    yourAlias: { en: 'Your Alias', tr: 'Kullanıcı Adın' },
    enterName: { en: 'Enter your name...', tr: 'Adını gir...' },
    hostGame: { en: 'Host a Game', tr: 'Oyun Kur' },
    enterCode: { en: 'Enter 6-digit code', tr: '6 haneli kodu gir' },
    joinRoom: { en: 'Join Room', tr: 'Odaya Katıl' },
    enterUsernameAlert: { en: 'Enter a username first!', tr: 'Önce bir kullanıcı adı girin!' },

    // Lobby
    roomCode: { en: 'Room Code', tr: 'Oda Kodu' },
    players: { en: 'Players', tr: 'Oyuncular' },
    you: { en: '(You)', tr: '(Sen)' },
    waitingPlayers: { en: 'Waiting for players to load...', tr: 'Oyuncuların yüklenmesi bekleniyor...' },
    rulesTitle: { en: 'Rules of the Game', tr: 'Oyunun Kuralları' },
    rulesText1: { en: '1 Narrator, 1 Guesser. Everyone else is a Saboteur.', tr: '1 Anlatıcı, 1 Tahminci. Geri kalan herkes Sabotajcı.' },
    rulesText2: { en: 'Saboteurs pick forbidden words. If the Narrator says them...', tr: 'Sabotajcılar yasaklı kelimeleri seçer. Anlatıcı onları söylerse...' },
    startGame: { en: 'Start Game', tr: 'Oyunu Başlat' },
    waitingHost: { en: 'Waiting for host to start...', tr: 'Kurucunun başlatması bekleniyor...' },
    needPlayersAlert: { en: 'Need at least 3 players to start!', tr: 'Başlamak için en az 3 çok oyuncu lazım!' },
    phase: { en: 'Phase', tr: 'Aşama' },
    role: { en: 'Role', tr: 'Rol' },

    // Sabotage Input Phase
    setTraps: { en: 'Set the Traps', tr: 'Tuzakları Kur' },
    setTrapsDesc: { en: 'What words will the narrator accidentally say?', tr: 'Anlatıcı kazara hangi kelimeleri söyleyecek?' },
    forbiddenWord: { en: 'Forbidden Word', tr: 'Yasaklı Kelime' },
    lockWords: { en: 'Lock Words', tr: 'Kelimeleri Kilitle' },
    wordsLocked: { en: 'Words Locked', tr: 'Kelimeler Kilitlendi' },
    waitingSaboteurs: { en: 'Waiting for other saboteurs...', tr: 'Diğer sabotajcılar bekleniyor...' },
    enterWordAlert: { en: 'Enter at least one word!', tr: 'En az bir kelime gir!' },

    // Narrator View
    youAreNarrator: { en: 'You are the Narrator', tr: 'Sen Anlatıcısın' },
    targetWord: { en: 'Target Word', tr: 'Hedef Kelime' },
    warning: { en: 'Warning', tr: 'Uyarı' },
    narratorWarningDesc: { en: 'Describe the word to the Guesser. Do NOT say any banned words chosen by the Saboteurs!', tr: 'Kelimeyi Tahminciye anlat. Sabotajcıların seçtiği UYARI kelimelerini SAKIN söyleme!' },
    saboteursSettingTraps: { en: 'Saboteurs are currently setting the traps...', tr: 'Sabotajcılar şu anda tuzakları kuruyor...' },
    getReady: { en: 'Get ready!', tr: 'Hazır ol!' },

    // Player Action View (Guesser & Saboteur)
    listenClosely: { en: 'Listen Closely...', tr: 'Dikkatlice Dinle...' },
    didNarratorSay: { en: 'Did the Narrator just say a forbidden word?', tr: 'Anlatıcı az önce yasaklı bir kelime mi söyledi?' },
    youAreGuesser: { en: 'You are the Guesser', tr: 'Sen Tahmincisin' },
    listenAndGuess: { en: 'Listen to the Narrator and guess the target word!', tr: 'Anlatıcıyı dinle ve hedef kelimeyi tahmin et!' },
    typeGuess: { en: 'Type your guess...', tr: 'Tahminini yaz...' },
    guessBtn: { en: 'Guess', tr: 'Tahmin Et' },
    whatWordSaid: { en: 'What word did the Narrator say?', tr: 'Anlatıcı hangi yasaklı kelimeyi söyledi?' }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Auto-detect browser language or fallback to Turkish if requested heavily by the user
    const [language, setLanguage] = useState<Language>(() => {
        if (typeof window !== 'undefined') {
            return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
        }
        return 'tr'; // Default to TR since the user specifically requested it and their OS locale might be TR
    });

    // Translation function
    const t = (key: string): string => {
        if (!translations[key]) {
            console.warn(`Translation key '${key}' not found.`);
            return key;
        }
        return translations[key][language];
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = (): LanguageContextType => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
