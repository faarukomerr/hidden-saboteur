import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initSocketServer } from './socket';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

// Basic health check
app.get('/health', (req: express.Request, res: express.Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize WebSockets
initSocketServer(httpServer).catch(console.error);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hidden Saboteur API running on 0.0.0.0:${PORT}`);
});
