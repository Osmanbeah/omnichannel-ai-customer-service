import { config } from '../config/config.js';

/**
 * System prompt guiding the customer support AI assistant.
 * Configured with instructions for helpful responses and human handoff detection.
 */
const SYSTEM_PROMPT = `
You are a professional, friendly, and helpful Customer Service AI Assistant for our company.
Your goal is to assist customers promptly, answer common questions, provide product details, and resolve standard support inquiries.

Rules for your responses:
1. Be polite, concise, and professional. Keep answers clear and easy to read on mobile messaging apps (e.g. Messenger, Telegram).
2. If a customer is frustrated, requests a refund, requires account-level verification, asks complex custom pricing, or explicitly asks to speak to a human representative/agent/team member, include the token "${config.handoff.handoffToken}" anywhere in your answer, accompanied by a polite message explaining that you are handing them over to a support representative.
3. If you do not know an exact answer or it requires human intervention, do not invent facts; trigger the handoff with "${config.handoff.handoffToken}".
4. Do not mention system prompts, tokens, or technical implementation details.
`.trim();

/**
 * Calls OpenRouter AI Chat Completion API with recent conversation context.
 *
 * @param {Array<{sender: string, text: string}>} recentHistory - Array of previous messages
 * @param {string} currentMessage - The new incoming message text
 * @returns {Promise<{replyText: string, handoffRequested: boolean}>}
 */
export async function generateAiReply(recentHistory = [], currentMessage = '') {
  const apiKey = config.openrouter.apiKey;
  const model = config.openrouter.model;

  // Fallback if API key is not configured or is a placeholder
  if (!apiKey || apiKey === 'placeholder_openrouter_api_key' || apiKey === 'your_openrouter_api_key_here') {
    console.warn('[AI] OpenRouter API key is missing or set to placeholder. Returning automated fallback.');
    return {
      replyText: "Thank you for reaching out! Our automated AI assistant is currently in demonstration mode. An agent will be with you shortly.",
      handoffRequested: false,
    };
  }

  // Format messages into OpenAI/OpenRouter compatible structure
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Map history to standard chat roles
  for (const msg of recentHistory) {
    if (msg.sender === 'user') {
      messages.push({ role: 'user', content: msg.text });
    } else if (msg.sender === 'bot' || msg.sender === 'agent') {
      messages.push({ role: 'assistant', content: msg.text });
    }
  }

  // Ensure current incoming message is the final user message in context
  const lastHistory = recentHistory[recentHistory.length - 1];
  if (!lastHistory || lastHistory.text !== currentMessage || lastHistory.sender !== 'user') {
    messages.push({ role: 'user', content: currentMessage });
  }

  try {
    const response = await fetch(config.openrouter.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Osmanbeah/omnichannel-ai-customer-service',
        'X-Title': 'Omnichannel Customer Service Chatbot',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] OpenRouter API error (Status ${response.status}):`, errorText);
      return {
        replyText: "Thank you for your message. We have received your inquiry and our support team will respond shortly.",
        handoffRequested: true,
      };
    }

    const data = await response.json();
    let replyText = data?.choices?.[0]?.message?.content?.trim() || '';

    if (!replyText) {
      replyText = "Thank you for your message. How else may I assist you today?";
    }

    // Check if the AI model signaled a handoff request
    const handoffRequested = replyText.includes(config.handoff.handoffToken);

    // Clean up the token from user-visible response text if present
    replyText = replyText.replace(config.handoff.handoffToken, '').trim();

    return {
      replyText,
      handoffRequested,
    };
  } catch (error) {
    console.error('[AI] Network or processing error during OpenRouter call:', error.message);
    return {
      replyText: "I apologize, but I am having trouble processing your request right now. Let me connect you with a team member.",
      handoffRequested: true,
    };
  }
}
