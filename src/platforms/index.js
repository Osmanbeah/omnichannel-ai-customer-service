import * as messenger from './messenger.js';
import * as telegram from './telegram.js';

/**
 * Registry of supported messaging platforms.
 * To add WhatsApp or another platform, create a new adapter in /platforms and register it here.
 */
export const platforms = {
  messenger: {
    name: 'Facebook Messenger',
    sendTextMessage: messenger.sendMessengerMessage,
    parseEvents: messenger.parseMessengerEvents,
    verifyWebhook: messenger.verifyMessengerWebhook,
  },
  telegram: {
    name: 'Telegram Bot',
    sendTextMessage: telegram.sendTelegramMessage,
    parseEvents: telegram.parseTelegramEvents,
  }
};

/**
 * Unified message dispatcher across any registered platform.
 *
 * @param {string} platform - 'messenger' | 'telegram' | etc.
 * @param {string} recipientId - External user ID or chat ID
 * @param {string} text - Message content
 * @returns {Promise<boolean>}
 */
export async function dispatchPlatformMessage(platform, recipientId, text) {
  const adapter = platforms[platform];
  if (!adapter) {
    console.error(`[Platforms] Unsupported platform: ${platform}`);
    return false;
  }
  return await adapter.sendTextMessage(recipientId, text);
}
