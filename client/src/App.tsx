import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './lib/SocketContext';
import { LanguageProvider } from './lib/i18n';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';

import { CustomCursor } from './components/ui/CustomCursor';

function App() {
    return (
        <LanguageProvider>
            <SocketProvider>
                <BrowserRouter>
                    <CustomCursor />
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
