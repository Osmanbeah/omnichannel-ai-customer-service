import express from 'express';
import { platforms } from '../platforms/index.js';
import { processInboundMessage } from '../services/chatService.js';

const router = express.Router();

/**
 * Facebook Messenger Webhook Verification (GET)
 * Used by Meta developers portal to verify the webhook URL and token.
 */
router.get('/messenger', (req, res) => {
  platforms.messenger.verifyWebhook(req, res);
});

/**
 * Facebook Messenger & Page Comments Webhook Receiver (POST)
 * Receives incoming messages, comments, and postbacks.
 */
router.post('/messenger', async (req, res) => {
  // Always acknowledge receipt to Meta within 20 seconds to prevent retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    const events = platforms.messenger.parseEvents(req.body);
    for (const event of events) {
      // Process each event asynchronously
      processInboundMessage(event).catch((err) => {
        console.error('[Webhook] Error processing Messenger event:', err);
      });
    }
  } catch (error) {
    console.error('[Webhook] Error parsing Messenger webhook payload:', error);
  }
});

/**
 * Telegram Bot Webhook Receiver (POST)
 * Receives incoming Telegram updates.
 */
router.post('/telegram', async (req, res) => {
  // Always return 200 OK to Telegram immediately
  res.status(200).json({ ok: true });

  try {
    const events = platforms.telegram.parseEvents(req.body);
    for (const event of events) {
      processInboundMessage(event).catch((err) => {
        console.error('[Webhook] Error processing Telegram event:', err);
      });
    }
  } catch (error) {
    console.error('[Webhook] Error parsing Telegram webhook payload:', error);
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
