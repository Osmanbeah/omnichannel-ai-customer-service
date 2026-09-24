-- Conversations table: Tracks active chats per user per platform
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,                     -- 'messenger' | 'telegram' | etc.
    external_user_id TEXT NOT NULL,             -- Platform-specific user/chat ID (e.g. PSID or Chat ID)
    user_name TEXT,                             -- User display name if available
    mode TEXT NOT NULL DEFAULT 'bot',           -- 'bot' (AI auto-replies) | 'human' (Agent takeover)
    status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'archived'
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, external_user_id)
);

-- Messages table: Stores all user queries, AI replies, and human agent interventions
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender TEXT NOT NULL,                       -- 'user' | 'bot' | 'agent'
    text TEXT NOT NULL,
    platform_message_id TEXT,                   -- Original message ID from platform if available
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_conversations_platform_user ON conversations(platform, external_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, created_at ASC);
