import { config } from '../config/config.js';

/**
 * Parses incoming Telegram Bot webhook updates.
 *
 * @param {object} body - Express req.body payload from Telegram
 * @returns {Array<{platform: string, externalUserId: string, userName: string, text: string, messageId: string}>}
 */
export function parseTelegramEvents(body) {
  const events = [];

  const msg = body.message || body.edited_message || body.channel_post;
  if (msg && msg.chat && msg.chat.id) {
    const text = msg.text || msg.caption || '';
    if (text) {
      const from = msg.from || {};
      const userName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || `Telegram User (${msg.chat.id})`;

      events.push({
        platform: 'telegram',
        externalUserId: String(msg.chat.id),
        userName: userName,
        text: text,
        messageId: String(msg.message_id || ''),
      });
    }
  }

  return events;
}

/**
 * Sends a text message to a Telegram Chat ID.
 *
 * @param {string|number} chatId - Telegram chat identifier
 * @param {string} text - Message text to send
 * @returns {Promise<boolean>}
 */
export async function sendTelegramMessage(chatId, text) {
  const token = config.telegram.botToken;

  if (!token || token.startsWith('placeholder_') || token.startsWith('your_')) {
    console.warn(`[Telegram Mock Send] To Chat ${chatId}: "${text}" (TELEGRAM_BOT_TOKEN not set)`);
    return true;
  }

  const url = `${config.telegram.apiBaseUrl}/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[Telegram API Error]:', data);
      return false;
    }

    console.log(`[Telegram] Message sent to chat ${chatId}, message_id: ${data.result?.message_id}`);
    return true;
  } catch (error) {
    console.error('[Telegram] Failed to send message:', error.message);
    return false;
  }
}

/**
 * Utility helper to set the webhook URL for the Telegram Bot.
 *
 * @param {string} webhookUrl - Public HTTPS URL (e.g. https://xyz.ngrok.app/webhook/telegram)
 * @returns {Promise<object>}
 */
export async function setTelegramWebhook(webhookUrl) {
  const token = config.telegram.botToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

  const url = `${config.telegram.apiBaseUrl}/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
  const response = await fetch(url);
  return await response.json();
}
