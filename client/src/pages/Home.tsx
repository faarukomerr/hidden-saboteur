import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { NeonCard } from '../components/ui/NeonCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LanguageToggle } from '../components/ui/LanguageToggle';
import { useSocket } from '../lib/SocketContext';
import { useLanguage } from '../lib/i18n';

export const Home = () => {
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const { t } = useLanguage();

    const handleCreateRoom = async () => {
        if (!username.trim()) return alert(t('enterUsernameAlert'));

        // In a real app we would hit the REST API to generate a DB room
        // Here we'll simulate the flow with WebSockets
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
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
            <LanguageToggle />

            <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`} />
                <span className="text-xs font-bold text-white/50 uppercase tracking-widest">
                    {isConnected ? t('serverOnline') : t('connecting')}
                </span>
            </div>

            <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, type: 'spring' }}
                className="mb-12 text-center"
            >
                <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                    HIDDEN<br />
                    <span className="text-brand-cyan drop-shadow-[0_0_30px_rgba(0,240,255,0.6)]">SABOTEUR</span>
                </h1>
                <p className="mt-4 text-xl text-white/70 tracking-widest font-medium">{t('subtitle')}</p>
            </motion.div>

            <NeonCard className="w-full max-w-md">
                <div className="space-y-8">
                    <Input
                        label={t('yourAlias')}
                        placeholder={t('enterName')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={15}
                    />

                    <div className="pt-4 space-y-4">
                        <Button
                            className="w-full"
                            size="lg"
                            onClick={handleCreateRoom}
                            disabled={!username.trim()}
                        >
                            {t('hostGame')}
                        </Button>

                        <div className="relative flex py-4 items-center">
                            <div className="flex-grow border-t border-white/10"></div>
                            <span className="flex-shrink-0 mx-4 text-white/40 text-sm font-bold uppercase tracking-widest">{t('or')}</span>
                            <div className="flex-grow border-t border-white/10"></div>
                        </div>

                        <form onSubmit={handleJoinRoom} className="space-y-4">
                            <Input
                                placeholder={t('enterCode')}
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value)}
                                maxLength={6}
                                className="text-center font-mono text-xl uppercase tracking-[0.3em]"
                            />
                            <Button
                                type="submit"
                                variant="secondary"
                                className="w-full"
                                size="lg"
                                isLoading={isJoining}
                                disabled={!username.trim() || roomCode.length < 3}
                            >
                                {t('joinRoom')}
                            </Button>
                        </form>
                    </div>
                </div>
            </NeonCard>
        </div>
    );
};
