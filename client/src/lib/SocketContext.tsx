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
        const explicitWsUrl = import.meta.env?.VITE_WS_URL;

        // 2. If it's missing (undefined or empty), fallback to the dynamic host (this fixes local connections)
        const wsUrl = explicitWsUrl || `http://${window.location.hostname}:8080`;

        console.log(`[Socket Context] Attempting connection to: ${wsUrl}`);
        console.log(`[Socket Context] Raw ENV VITE_WS_URL was:`, explicitWsUrl);

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
