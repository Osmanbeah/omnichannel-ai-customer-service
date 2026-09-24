import { config } from '../config/config.js';
import * as db from '../db/database.js';
import { generateAiReply } from '../ai/openrouter.js';
import { dispatchPlatformMessage } from '../platforms/index.js';

/**
 * Checks if incoming text matches any configured handoff keywords.
 *
 * @param {string} text - Message text
 * @returns {boolean}
 */
function containsHandoffKeyword(text = '') {
  const normalized = text.toLowerCase();
  return config.handoff.keywords.some((keyword) => {
    // Match word boundaries or substring
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(normalized) || normalized.includes(keyword);
  });
}

/**
 * Core message ingestion & orchestration service.
 * Handles incoming messages from any platform, evaluates mode, calls AI or escalates to human.
 *
 * @param {object} event - Parsed incoming message event
 * @param {string} event.platform - 'messenger' | 'telegram' | etc.
 * @param {string} event.externalUserId - Platform user or chat ID
 * @param {string} [event.userName] - Display name of the user
 * @param {string} event.text - Inbound message content
 * @param {string} [event.messageId] - Platform-specific message ID
 */
export async function processInboundMessage({ platform, externalUserId, userName, text, messageId }) {
  if (!text || !text.trim()) {
    console.log(`[ChatService] Ignored empty message from ${platform}:${externalUserId}`);
    return;
  }

  console.log(`[ChatService] Received message on [${platform}] from ${userName || externalUserId}: "${text}"`);

  // 1. Get or create conversation in SQLite
  const conversation = await db.getOrCreateConversation(platform, externalUserId, userName);

  // 2. Save incoming user message in DB
  const savedUserMsg = await db.saveMessage(conversation.id, 'user', text.trim(), messageId);

  // 3. Check for explicit keyword-based handoff trigger
  const userRequestedHandoff = containsHandoffKeyword(text);

  if (userRequestedHandoff) {
    console.log(`[ChatService] Handoff keyword detected for conversation #${conversation.id}. Switching to HUMAN mode.`);
    
    // Switch to human mode
    await db.updateConversationMode(conversation.id, 'human');

    // Notify user via the platform and save to DB
    const handoffText = config.handoff.handoffMessage;
    await db.saveMessage(conversation.id, 'bot', handoffText);
    await dispatchPlatformMessage(platform, externalUserId, handoffText);
    return;
  }

  // 4. Check if conversation is already in human mode (team member has taken over)
  if (conversation.mode === 'human') {
    console.log(`[ChatService] Conversation #${conversation.id} is in HUMAN mode. Skipping automated bot reply.`);
    return;
  }

  // 5. Bot Mode: Fetch context history (last 10 messages)
  const recentHistory = await db.getRecentMessages(conversation.id, 10);

  // 6. Generate reply via OpenRouter AI
  console.log(`[ChatService] Generating AI response for conversation #${conversation.id} using model: ${config.openrouter.model}`);
  const { replyText, handoffRequested } = await generateAiReply(recentHistory, text);

  // 7. If AI decided handoff is required
  if (handoffRequested) {
    console.log(`[ChatService] AI triggered human escalation for conversation #${conversation.id}.`);
    await db.updateConversationMode(conversation.id, 'human');
  }

  // 8. Save bot response to DB
  await db.saveMessage(conversation.id, 'bot', replyText);

  // 9. Dispatch reply to user through origin platform API
  await dispatchPlatformMessage(platform, externalUserId, replyText);
}

/**
 * Handles manual reply sent by a human agent from the Team Dashboard.
 *
 * @param {number} conversationId - DB conversation ID
 * @param {string} agentText - Text message typed by team member
 * @returns {Promise<object>} Saved message record
 */
export async function sendAgentReply(conversationId, agentText) {
  const conversation = await db.getConversationById(conversationId);
  if (!conversation) {
    throw new Error(`Conversation #${conversationId} not found.`);
  }

  if (!agentText || !agentText.trim()) {
    throw new Error('Reply message cannot be empty.');
  }

  // Save agent message to DB
  const savedMessage = await db.saveMessage(conversation.id, 'agent', agentText.trim());

  // Dispatch to platform
  const success = await dispatchPlatformMessage(
    conversation.platform,
    conversation.external_user_id,
    agentText.trim()
  );

  return {
    message: savedMessage,
    delivered: success,
  };
}

/**
 * Toggles or updates the conversation mode (bot <-> human) from Dashboard.
 *
 * @param {number} conversationId - DB conversation ID
 * @param {'bot'|'human'} newMode - Target mode
 */
export async function switchConversationMode(conversationId, newMode) {
  const updatedConversation = await db.updateConversationMode(conversationId, newMode);

  // If switched back to bot mode, optionally send a friendly greeting
  if (newMode === 'bot') {
    const resumeNotice = config.handoff.botResumedMessage;
    await db.saveMessage(conversationId, 'bot', resumeNotice);
    await dispatchPlatformMessage(
      updatedConversation.platform,
      updatedConversation.external_user_id,
      resumeNotice
    );
  }

  return updatedConversation;
}
