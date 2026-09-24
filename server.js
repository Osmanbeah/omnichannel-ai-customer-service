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

// Ensure DB initialization on first request (essential for serverless environments)
app.use(async (req, res, next) => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('[Server] DB lazy init notice:', err.message);
  }
  next();
});

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'public')));

// Mount routes
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Fallback to Dashboard (or handle Meta challenge if sent to root)
app.get('*', (req, res, next) => {
  if (req.query['hub.mode'] && req.query['hub.challenge']) {
    return webhookRoutes(req, res, next);
  }
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

// Start listening when executed directly (local/standard node process)
if (!process.env.VERCEL) {
  initDatabase().then(() => {
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
  }).catch((err) => {
    console.error('Database startup error:', err);
  });
}

// Export default app for Vercel / serverless runtime
export default app;
