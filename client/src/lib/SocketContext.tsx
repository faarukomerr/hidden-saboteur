import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // 1. Check if Vercel successfully injected the environment variable during build
        let explicitWsUrl = import.meta.env?.VITE_WS_URL;

        // 2. Fool-proof fallback: If we are on Vercel, ALWAYS use the official Render backend.
        if (!explicitWsUrl && window.location.hostname.includes('vercel.app')) {
            explicitWsUrl = 'https://hidden-saboteur.onrender.com';
        }

        // 3. Fallback to Local Network Dynamic IP for dev testing only when not on Vercel
        const wsUrl = explicitWsUrl || `http://${window.location.hostname}:8080`;

        console.log(`[Socket Context] Attempting connection to: ${wsUrl}`);
        console.log(`[Socket Context] Raw ENV VITE_WS_URL was:`, import.meta.env?.VITE_WS_URL);

        const socketInstance = io(wsUrl, {
            transports: ['websocket', 'polling'], // Fallback to long-polling if WSS fails on strict networks
            reconnectionAttempts: 5,
            autoConnect: true,
        });

        socketInstance.on('connect', () => {
            console.log('Connected to game server', socketInstance.id);
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log('Disconnected from game server');
            setIsConnected(false);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
