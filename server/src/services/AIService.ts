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
    static async generateTargetWords(category: string, difficulty: string, language: string = 'en'): Promise<string[]> {
        const fallbackWordsTR = ['Buzdolabı', 'Palyaço', 'Teleskop', 'Volkan', 'Denizaltı', 'Gökkuşağı', 'Kaktüs', 'Bumerang', 'Periskop', 'Trampolin', 'Ahtapot', 'Karınca', 'Ambulans', 'Termos', 'Pergel'];
        const fallbackWordsEN = ['Refrigerator', 'Telescope', 'Volcano', 'Submarine', 'Rainbow', 'Cactus', 'Boomerang', 'Periscope', 'Trampoline', 'Octopus', 'Ambulance', 'Thermos', 'Compass', 'Chandelier', 'Platypus'];
        const fallbackWords = language === 'tr' ? fallbackWordsTR : fallbackWordsEN;

        if (!model) return fallbackWords;

        const categories = [
            'Animals & Nature', 'Food & Cooking', 'Sports & Games', 'Technology & Science',
            'History & Culture', 'Music & Art', 'Travel & Places', 'Professions & Jobs',
            'Household Items', 'Fantasy & Mythology', 'Vehicles & Transport', 'Space & Astronomy'
        ];
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const langName = language === 'tr' ? 'Turkish' : 'English';

        const prompt = `You are a creative word game designer. Generate 12 unique, challenging words for a party word-guessing game.

Rules:
- Category: "${randomCategory}"
- Language: ALL words MUST be in ${langName}
- Difficulty: Hard — pick words that are fun to describe but NOT obvious
- Words should be specific nouns (not abstract concepts)
- Mix common and uncommon words for variety
- Each word should be 1-2 words maximum
- Make them fun and interesting to act out or describe

Return ONLY a JSON array of 12 strings, nothing else.`;

        try {
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();
            if (text.startsWith('\`\`\`json')) text = text.substring(7, text.length - 3).trim();
            if (text.startsWith('\`\`\`')) text = text.substring(3, text.length - 3).trim();
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallbackWords;
        } catch (error) {
            console.error('Gemini word generation failed:', error);
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
