import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  
  // Facebook / Messenger configuration
  facebook: {
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
    verifyToken: process.env.FB_VERIFY_TOKEN || '',
    graphApiBaseUrl: 'https://graph.facebook.com/v19.0',
  },

  // Telegram configuration
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    apiBaseUrl: 'https://api.telegram.org',
  },

  // OpenRouter AI configuration
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
  },

  // Handoff triggers & keywords
  handoff: {
    keywords: (process.env.HANDOFF_KEYWORDS || 'human,agent,representative,support,talk to someone,help desk,real person,operator')
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean),
    handoffToken: '[HANDOFF_REQUESTED]',
    handoffMessage: "I am connecting you with a human support agent. A team member will join this conversation shortly! 🤝",
    botResumedMessage: "Automated AI assistant has resumed. How can I help you today? 🤖",
  },

  // Database path (uses /tmp on Vercel/serverless where root fs is read-only)
  db: {
    path: process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join('/tmp', 'chatbot.db')
      : path.resolve(__dirname, '../../data/chatbot.db'),
  }
};
