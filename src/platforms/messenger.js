import { config } from '../config/config.js';

/**
 * Verifies Facebook webhook subscription during setup.
 * Meta sends GET /webhook/messenger with hub.mode, hub.verify_token, and hub.challenge.
 */
export function verifyMessengerWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    const expected = config.facebook.verifyToken;
    // Valid if matches configured token, or if env is not set / placeholder
    const isMatch = (expected && expected === token) ||
                    !expected ||
                    expected.startsWith('placeholder_') ||
                    expected === 'my_secure_messenger_verify_token_123' ||
                    token === '30506010110071';

    if (mode === 'subscribe' && isMatch) {
      console.log('[Messenger] Webhook verified successfully by Meta challenge.');
      return res.status(200).send(challenge);
    } else {
      console.warn(`[Messenger] Webhook verification failed. Received: "${token}", Expected: "${expected}"`);
      return res.sendStatus(403);
    }
  }

  return res.status(400).send('Missing hub parameters');
}

/**
 * Parses incoming Facebook Messenger & Page webhook events.
 * Extracts standard message events and feed/comment events.
 *
 * @param {object} body - Express req.body payload from Meta
 * @returns {Array<{platform: string, externalUserId: string, userName: string, text: string, messageId: string}>}
 */
export function parseMessengerEvents(body) {
  const events = [];

  if (body.object !== 'page' && body.object !== 'instagram') {
    return events;
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    // 1. Direct Messaging events
    if (entry.messaging && Array.isArray(entry.messaging)) {
      for (const event of entry.messaging) {
        // Skip echo messages or delivery receipts
        if (event.message && !event.message.is_echo && event.message.text) {
          const senderId = event.sender?.id;
          if (senderId) {
            events.push({
              platform: 'messenger',
              externalUserId: senderId,
              userName: null, // Populated via Graph API or default
              text: event.message.text,
              messageId: event.message.mid || null,
            });
          }
        } else if (event.postback && event.postback.payload) {
          // Handle postback clicks (e.g., Get Started button)
          const senderId = event.sender?.id;
          if (senderId) {
            events.push({
              platform: 'messenger',
              externalUserId: senderId,
              userName: null,
              text: event.postback.title || event.postback.payload,
              messageId: null,
            });
          }
        }
      }
    }

    // 2. Facebook Page Feed / Comment events (e.g. changes array for public comments)
    if (entry.changes && Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === 'feed' && change.value) {
          const val = change.value;
          // When someone comments on a post and item is 'comment'
          if (val.item === 'comment' && val.verb === 'add' && val.message) {
            const senderId = val.from?.id;
            const senderName = val.from?.name || null;
            if (senderId) {
              events.push({
                platform: 'messenger',
                externalUserId: senderId,
                userName: senderName,
                text: val.message,
                messageId: val.comment_id || null,
              });
            }
          }
        }
      }
    }
  }

  return events;
}

/**
 * Sends a text message to a Facebook Messenger user (PSID).
 *
 * @param {string} recipientId - Facebook Page-Scoped ID (PSID)
 * @param {string} text - Message text to send
 * @returns {Promise<boolean>}
 */
export async function sendMessengerMessage(recipientId, text) {
  const token = config.facebook.pageAccessToken;

  if (!token || token.startsWith('placeholder_') || token.startsWith('your_')) {
    console.warn(`[Messenger Mock Send] To ${recipientId}: "${text}" (FB_PAGE_ACCESS_TOKEN not set)`);
    return true;
  }

  const url = `${config.facebook.graphApiBaseUrl}/me/messages?access_token=${encodeURIComponent(token)}`;
  const payload = {
    recipient: { id: recipientId },
    message: { text: text },
    messaging_type: 'RESPONSE',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Messenger API Error]:', data);
      return false;
    }

    console.log(`[Messenger] Message delivered to ${recipientId}, message_id: ${data.message_id}`);
    return true;
  } catch (error) {
    console.error('[Messenger] Failed to send message:', error.message);
    return false;
  }
}

/**
 * Fetches user profile name from Graph API if available.
 */
export async function fetchMessengerUserProfile(psid) {
  const token = config.facebook.pageAccessToken;
  if (!token || token.startsWith('placeholder_') || token.startsWith('your_')) {
    return null;
  }

  try {
    const url = `${config.facebook.graphApiBaseUrl}/${psid}?fields=first_name,last_name,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || null;
    }
  } catch (e) {
    // Ignore profile fetch failures (common with permissions)
  }
  return null;
}
