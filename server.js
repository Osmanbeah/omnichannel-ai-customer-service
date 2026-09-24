import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config/config.js';
import { initDatabase } from './src/db/database.js';
import webhookRoutes from './src/routes/webhookRoutes.js';
import apiRoutes from './src/routes/apiRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'public')));

// Mount routes
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Fallback to Dashboard
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start Server
async function startServer() {
  try {
    // 1. Initialize SQLite database & tables
    await initDatabase();

    // 2. Start listening on configured port
    app.listen(config.port, () => {
      console.log('====================================================');
      console.log(`🚀 Omnichannel AI Customer Service Backend Running!`);
      console.log(`🌐 Local Dashboard:     http://localhost:${config.port}`);
      console.log(`📥 Messenger Webhook:   http://localhost:${config.port}/webhook/messenger`);
      console.log(`📥 Telegram Webhook:    http://localhost:${config.port}/webhook/telegram`);
      console.log(`🤖 AI Model:            ${config.openrouter.model}`);
      console.log(`🔑 OpenRouter Key:      ${config.openrouter.apiKey ? 'Configured' : 'Missing (Mock mode)'}`);
      console.log('====================================================');
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

startServer();
