# 🤖 Omnichannel AI Customer Service Chatbot & Human Handoff Backend

An enterprise-ready customer service chatbot backend built with **Node.js + Express** and **SQLite**, connecting **Facebook Messenger**, **Facebook Page DMs & Comments**, and **Telegram Bot**. It leverages **OpenRouter AI (Free Tier)** for multi-turn automated responses and includes a **Live Team Dashboard** with a human handoff system.

---

## 🌟 Features

- **Multi-Platform Support**: Unified architecture supporting Facebook Messenger, Facebook Page DMs/comments, and Telegram Bots.
- **AI-Powered Replies via OpenRouter**: Multi-turn conversation context (~last 10 messages) using customizable models (e.g. `meta-llama/llama-3.1-8b-instruct:free`, `meta-llama/llama-3.3-70b-instruct:free`, `google/gemini-2.0-flash-exp:free`).
- **Intelligent Human Handoff**:
  - Automatically escalates when a user types trigger keywords (*"human"*, *"agent"*, *"talk to someone"*, etc.).
  - Escalates when the AI detects complex inquiries, refund disputes, or asks for escalation.
  - Automatically stops bot auto-replies while in human mode.
- **Live Team Dashboard**:
  - Web dashboard to monitor active chats in real-time.
  - One-click manual agent replies sent directly back to the customer's chat app.
  - One-click toggle between `🤖 Bot Mode` and `👤 Human Takeover`.
  - Built-in **Message Simulator** to test the entire pipeline without waiting for live webhook tunnels.
- **SQLite Database**: Self-contained local storage with zero complex database setup.
- **Extensible Architecture**: Modular `/platforms` folder makes adding WhatsApp (Cloud API or Twilio) straightforward.

---

## 📁 Project Structure

```
chatbot/
├── .env.example                # Template with all environment variables
├── .env                        # Local configuration file (gitignored)
├── package.json                # Project manifest & scripts
├── server.js                   # Main Express server entry point
├── README.md                   # Setup documentation
├── data/
│   └── chatbot.db              # SQLite database (auto-generated)
├── public/                     # Team Handoff Dashboard (Frontend SPA)
│   ├── index.html              # Dashboard layout
│   ├── css/
│   │   └── styles.css          # Modern dark/light styling
│   └── js/
│       └── app.js              # Real-time dashboard state & polling
└── src/
    ├── config/
    │   └── config.js           # Centralized environment variable loader
    ├── db/
    │   ├── database.js         # SQLite connection & query helpers
    │   └── schema.sql          # Conversations & Messages tables schema
    ├── ai/
    │   └── openrouter.js       # OpenRouter client with context & handoff prompt
    ├── platforms/
    │   ├── index.js            # Platform registry & unified message dispatcher
    │   ├── messenger.js        # Facebook Messenger & Page comments adapter
    │   └── telegram.js         # Telegram Bot adapter
    ├── services/
    │   └── chatService.js      # Message ingestion pipeline, AI reply & handoff logic
    └── routes/
        ├── webhookRoutes.js    # /webhook/messenger and /webhook/telegram
        └── apiRoutes.js        # REST endpoints for dashboard & message simulator
```

---

## 🚀 Quick Start

### 1. Install Dependencies
Make sure you have Node.js 18+ or Bun installed:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` and fill in your tokens:

```env
# Server Port
PORT=3000

# Facebook / Messenger
FB_PAGE_ACCESS_TOKEN=your_facebook_page_access_token_here
FB_VERIFY_TOKEN=my_secure_messenger_verify_token_123

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# OpenRouter AI
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

# Handoff Keywords (Comma-separated)
HANDOFF_KEYWORDS=human,agent,representative,support,talk to someone,help desk,real person,operator
```

### 3. Start the Server
```bash
npm start
# or for auto-reloading during development:
npm run dev
```

Visit the dashboard in your browser: **`http://localhost:3000`**

---

## 🔑 Where to Get Each API Key & Token

### 1. OpenRouter API Key (Free AI Models)
1. Go to [https://openrouter.ai/](https://openrouter.ai/) and sign in.
2. Navigate to **Keys** -> **Create Key**: [https://openrouter.ai/keys](https://openrouter.ai/keys).
3. Paste the key into `OPENROUTER_API_KEY` in your `.env`.
4. Free models you can use in `OPENROUTER_MODEL`:
   - `meta-llama/llama-3.1-8b-instruct:free`
   - `meta-llama/llama-3.3-70b-instruct:free`
   - `google/gemini-2.0-flash-exp:free`
   - `mistralai/mistral-7b-instruct:free`

---

### 2. Facebook Messenger & Page Setup
1. Go to [Meta for Developers](https://developers.facebook.com/) and create a **Business** App.
2. Under **Add Products to Your App**, add **Messenger** and **Webhooks**.
3. Under **Messenger** -> **API Setup**:
   - Link your Facebook Page and generate a **Page Access Token**.
   - Paste it into `FB_PAGE_ACCESS_TOKEN` in your `.env`.
4. Set a custom verification token (e.g. `my_secure_messenger_verify_token_123`) in `FB_VERIFY_TOKEN`.
5. Expose your local server via a tunnel (e.g., `ngrok http 3000`).
6. In the Meta Webhooks configuration:
   - **Callback URL**: `https://your-ngrok-domain.ngrok-free.app/webhook/messenger`
   - **Verify Token**: Match your `FB_VERIFY_TOKEN`.
   - Click **Verify and Save**.
   - Subscribe to the `messages`, `messaging_postbacks`, and `feed` fields.

---

### 3. Telegram Bot Setup
1. Open Telegram and search for [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the prompts to create your bot and choose a username.
3. BotFather will provide an API token (e.g. `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
4. Paste this token into `TELEGRAM_BOT_TOKEN` in your `.env`.
5. Set your public webhook URL by running this in your terminal (or browser):
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-ngrok-domain.ngrok-free.app/webhook/telegram"
   ```

---

## 🧪 Testing Without External Webhooks

The backend includes a **Message Simulator** built directly into the web UI and REST API.

1. Open **`http://localhost:3000`**
2. Click **⚡ Simulate Message** in the top right.
3. Choose platform (Messenger or Telegram), enter user name and a message.
4. Try typing:
   - *"What are your opening hours?"* -> Bot will automatically reply.
   - *"Can I speak with a human agent?"* -> System detects handoff keyword, switches to **Human Mode**, and alerts the team dashboard!

You can also simulate via `curl`:
```bash
curl -X POST http://localhost:3000/api/simulate-message \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "telegram",
    "externalUserId": "test_user_456",
    "userName": "Alex Smith",
    "text": "Hello, I need help with my reservation"
  }'
```

---

## 🔌 Adding WhatsApp or Other Channels

The project uses a unified adapter interface in `src/platforms/`:

1. Create `src/platforms/whatsapp.js`:
   ```javascript
   export async function sendWhatsAppComponent(recipientPhone, text) {
     // Call WhatsApp Cloud API or Twilio
   }
   export function parseWhatsAppEvents(body) {
     // Extract phone number and message
     return [{ platform: 'whatsapp', externalUserId: phone, text }];
   }
   ```
2. Register it in `src/platforms/index.js`:
   ```javascript
   import * as whatsapp from './whatsapp.js';
   export const platforms = {
     messenger,
     telegram,
     whatsapp: {
       name: 'WhatsApp',
       sendTextMessage: whatsapp.sendWhatsAppMessage,
       parseEvents: whatsapp.parseWhatsAppEvents,
     }
   };
   ```
3. Mount the webhook in `src/routes/webhookRoutes.js`.

---

## 🛠 Tech Stack

- **Runtime**: Node.js / Bun
- **Framework**: Express.js
- **Database**: SQLite3
- **AI Gateway**: OpenRouter API
- **UI**: Vanilla HTML5 / CSS3 / JavaScript (No build step required)
