import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LanguageToggle } from '../components/ui/LanguageToggle';
import { useSocket } from '../lib/SocketContext';
import { useLanguage } from '../lib/i18n';
import { Wifi, WifiOff, Swords, Users, ChevronRight } from 'lucide-react';

export const Home = () => {
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const navigate = useNavigate();
    const { isConnected } = useSocket();
    const { t } = useLanguage();

    const handleCreateRoom = async () => {
        if (!username.trim()) return alert(t('enterUsernameAlert'));
        const fakeRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
        navigate(`/room/${fakeRoom}?user=${username}&host=true`);
    };

    const handleJoinRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !roomCode.trim()) return;
        setIsJoining(true);
        navigate(`/room/${roomCode.toUpperCase()}?user=${username}`);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 sm:p-6 relative overflow-hidden">

            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top))]">
                <motion.div
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border ${isConnected ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                >
                    {isConnected
                        ? <Wifi className="w-3 h-3" />
                        : <WifiOff className="w-3 h-3" />
                    }
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {isConnected ? t('serverOnline') : t('connecting')}
                    </span>
                </motion.div>
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                    <LanguageToggle />
                </motion.div>
            </div>

            {/* Hero Section */}
            <motion.div
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.9, type: 'spring', bounce: 0.3 }}
                className="mb-10 md:mb-14 text-center"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="inline-flex items-center gap-2 bg-brand-pink/10 border border-brand-pink/20 px-4 py-1.5 rounded-full mb-6"
                >
                    <Swords className="w-3.5 h-3.5 text-brand-pink" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-pink">Ultimate Party Game</span>
                </motion.div>

                <h1 className="text-[clamp(3.5rem,14vw,7rem)] font-black italic tracking-tighter leading-[0.9] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">
                    HIDDEN
                    <br />
                    <span className="text-brand-cyan drop-shadow-[0_0_40px_rgba(0,240,255,0.7)] not-italic">
                        SABOTEUR
                    </span>
                </h1>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-5 text-white/40 tracking-widest font-medium text-xs md:text-sm uppercase"
                >
                    {t('subtitle')}
                </motion.p>
            </motion.div>

            {/* Form Card */}
            <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2, type: 'spring', bounce: 0.2 }}
                className="w-full max-w-sm"
            >
                <NeonCard className="w-full">
                    <div className="space-y-6">
                        <Input
                            label={t('yourAlias')}
                            placeholder={t('enterName')}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={15}
                        />

                        <div className="pt-2 space-y-3">
                            <Button
                                className="w-full flex items-center justify-center gap-3 group"
                                size="lg"
                                onClick={handleCreateRoom}
                                disabled={!username.trim()}
                            >
                                <Users className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                {t('hostGame')}
                                <ChevronRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                            </Button>

                            <div className="relative flex py-3 items-center">
                                <div className="flex-grow border-t border-white/10"></div>
                                <span className="flex-shrink-0 mx-4 text-white/30 text-[10px] font-black uppercase tracking-widest">{t('or')}</span>
                                <div className="flex-grow border-t border-white/10"></div>
                            </div>

                            <form onSubmit={handleJoinRoom} className="space-y-3">
                                <Input
                                    placeholder={t('enterCode')}
                                    value={roomCode}
                                    onChange={(e) => setRoomCode(e.target.value)}
                                    maxLength={6}
                                    className="text-center font-mono text-xl uppercase tracking-[0.4em]"
                                />
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    className="w-full flex items-center justify-center gap-3 group"
                                    size="lg"
                                    isLoading={isJoining}
                                    disabled={!username.trim() || roomCode.length < 3}
                                >
                                    <ChevronRight className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    {t('joinRoom')}
                                </Button>
                            </form>
                        </div>
                    </div>
                </NeonCard>
            </motion.div>

            {/* Bottom badge */}
            <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                className="mt-8 text-white/15 text-[10px] font-bold uppercase tracking-[0.3em] pb-[env(safe-area-inset-bottom)]"
            >
                Real-Time · AI-Powered · Party Game
            </motion.p>
        </div>
    );
};
