import express from 'express';
import * as db from '../db/database.js';
import { sendAgentReply, switchConversationMode, processInboundMessage } from '../services/chatService.js';

const router = express.Router();

/**
 * GET /api/conversations
 * Returns list of all conversations with recent message previews and status.
 */
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await db.getAllConversations();
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('[API] Failed to fetch conversations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/conversations/:id
 * Returns conversation details and full message history for the chat thread.
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const conversation = await db.getConversationById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = await db.getConversationMessages(conversationId);
    res.json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    console.error(`[API] Failed to fetch conversation #${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/conversations/:id/reply
 * Allows human support team to send manual replies from the dashboard.
 */
router.post('/conversations/:id/reply', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }

    const result = await sendAgentReply(conversationId, text);
    res.json({
      success: true,
      message: result.message,
      delivered: result.delivered,
    });
  } catch (error) {
    console.error(`[API] Error sending agent reply to conversation #${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/conversations/:id/mode
 * Toggles a conversation between 'bot' and 'human' mode.
 */
router.post('/api/conversations/:id/mode', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { mode } = req.body;

    if (!['bot', 'human'].includes(mode)) {
      return res.status(400).json({ success: false, error: "Mode must be 'bot' or 'human'" });
    }

    const updated = await switchConversationMode(conversationId, mode);
    res.json({ success: true, conversation: updated });
  } catch (error) {
    console.error(`[API] Error switching mode for conversation #${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/conversations/:id/mode (alternative path for flexibility)
 */
router.post('/conversations/:id/mode', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { mode } = req.body;

    if (!['bot', 'human'].includes(mode)) {
      return res.status(400).json({ success: false, error: "Mode must be 'bot' or 'human'" });
    }

    const updated = await switchConversationMode(conversationId, mode);
    res.json({ success: true, conversation: updated });
  } catch (error) {
    console.error(`[API] Error switching mode for conversation #${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/simulate-message
 * Helper endpoint for local development to simulate incoming messages without live webhooks.
 */
router.post('/simulate-message', async (req, res) => {
  try {
    const { platform = 'messenger', externalUserId = 'sim_user_101', userName = 'Simulated Customer', text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required for simulation' });
    }

    await processInboundMessage({
      platform,
      externalUserId,
      userName,
      text,
      messageId: `sim_${Date.now()}`,
    });

    res.json({ success: true, message: 'Message simulated and processed successfully' });
  } catch (error) {
    console.error('[API] Error simulating message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
