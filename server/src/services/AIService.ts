import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

if (process.env.GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    } catch (e) {
        console.warn("Failed to initialize Gemini:", e);
    }
}

export class AIService {
    static async generateTargetWords(category: string, difficulty: string): Promise<string[]> {
        const fallbackWords = ['Klavye', 'Monitör', 'Fare', 'Masa', 'Sandalye', 'Mikrofon', 'Kamera', 'Kulaklık', 'Hoparlör', 'Modem'];

        if (!model) {
            console.log('Skipping Gemini, using fallback words');
            return fallbackWords;
        }

        const prompt = `Generate 10 highly creative, tricky ${difficulty} difficulty items for a party word-guessing game in the category "${category}". The words MUST BE in Turkish. Return exactly a JSON array of strings and nothing else.`;

        try {
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();
            // Handle markdown wrapper
            if (text.startsWith('```json')) {
                text = text.substring(7, text.length - 3).trim();
            }
            return JSON.parse(text);
        } catch (error) {
            console.error('Failed to generate words via Gemini:', error);
            // Fallback list
            return fallbackWords;
        }
    }

    static async generateHostCommentary(narrator: string, word: string): Promise<string> {
        const fallbackInsult = `Vay canına, ${narrator}. Gerçekten o tuzağa düştün mü?`;

        if (!model) {
            return fallbackInsult;
        }

        const prompt = `You are a snarky, high-energy gameshow host in a Turkish gameshow. The narrator named ${narrator} just accidentally said the forbidden word "${word}" and lost the round. Write a 1-sentence sarcastic and funny insult. The insult MUST BE in Turkish.`;

        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error) {
            return fallbackInsult;
        }
    }
}
