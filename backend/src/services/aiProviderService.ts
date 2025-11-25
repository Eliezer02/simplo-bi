import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const generateText = async (provider: 'openai' | 'gemini', prompt: string) => {
  try {
    if (provider === 'openai') {
      console.log('🤖 Gerando resposta com GPT...');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      });
      return completion.choices[0].message.content || "Sem resposta.";
    } 
    
    else if (provider === 'gemini') {
      console.log('✨ Gerando resposta com Gemini...');

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }

    throw new Error("Provedor de IA inválido.");

  } catch (error: any) {
    console.error(`Erro no provedor ${provider}:`, error);
    throw new Error(`Falha ao gerar texto com ${provider}.`);
  }
};