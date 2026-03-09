import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export class AIService {
    static async generateTargetWords(category: string, difficulty: string): Promise<string[]> {
        const prompt = `Generate 10 highly creative, tricky ${difficulty} difficulty items for a party word-guessing game in the category "${category}". Return exactly a JSON array of strings and nothing else.`;

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
            return ['Keyboard', 'Monitor', 'Mouse', 'Desk', 'Chair', 'Microphone', 'Webcam', 'Headphones', 'Speaker', 'Router'];
        }
    }

    static async generateHostCommentary(narrator: string, word: string): Promise<string> {
        const prompt = `You are a snarky, high-energy gameshow host. The narrator named ${narrator} just accidentally said the forbidden word "${word}" and lost the round. Write a 1-sentence sarcastic and funny insult.`;

        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error) {
            return `Oh wow, ${narrator}. You really stepped right into that one, didn't you?`;
        }
    }
}
