import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './lib/SocketContext';
import { LanguageProvider } from './lib/i18n';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { MaintenancePage } from './pages/MaintenancePage';
import { MAINTENANCE_MODE } from './config/maintenance';

function App() {
    if (MAINTENANCE_MODE) {
        return <MaintenancePage />;
    }

    return (
        <LanguageProvider>
            <SocketProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/room/:id" element={<Lobby />} />
                    </Routes>
                </BrowserRouter>
            </SocketProvider>
        </LanguageProvider>
    );
}

export default App;
