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
        // If the user hasn't explicitly set VITE_WS_URL, assume the Node server is running on the 
        // same machine that is serving the frontend, just on port 8080.
        // We use window.location.hostname to dynamically find the LAN IP instead of hardcoding localhost.
        const wsUrl = import.meta.env?.VITE_WS_URL || `http://${window.location.hostname}:8080`;

        const socketInstance = io(wsUrl, {
            transports: ['websocket'],
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
