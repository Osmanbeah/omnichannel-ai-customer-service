import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enable verbose mode for debugging if not in production
const sqlite = sqlite3.verbose ? sqlite3.verbose() : sqlite3;
let dbInstance = null;
let isInitialized = false;

// Fallback in-memory store if native SQLite fails on serverless runtimes
const inMemoryStore = {
  conversations: [],
  messages: [],
  nextConvoId: 1,
  nextMsgId: 1,
};
let useInMemoryFallback = false;

/**
 * Resolves safe database file path, ensuring writable directory.
 */
function getSafeDbPath() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join('/tmp', 'chatbot.db');
  }

  try {
    const targetDir = path.dirname(config.db.path);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return config.db.path;
  } catch (err) {
    console.warn('[DB] Could not write to target DB directory. Falling back to /tmp/chatbot.db:', err.message);
    return path.join('/tmp', 'chatbot.db');
  }
}

/**
 * Initializes the SQLite database connection.
 */
export function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = getSafeDbPath();

  try {
    dbInstance = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error('[DB] Failed to connect to SQLite file. Falling back to memory mode:', err.message);
        useInMemoryFallback = true;
      } else {
        console.log(`[DB] Connected to SQLite database at: ${dbPath}`);
      }
    });
  } catch (err) {
    console.warn('[DB] SQLite initialization failed, enabling in-memory fallback:', err.message);
    useInMemoryFallback = true;
  }

  return dbInstance;
}

/**
 * Helper to run a SQL query that doesn't return rows (INSERT, UPDATE, DELETE).
 */
export function run(sql, params = []) {
  if (useInMemoryFallback) return Promise.resolve({ lastID: 1, changes: 1 });
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Helper to run a SQL query returning a single row.
 */
export function get(sql, params = []) {
  if (useInMemoryFallback) return Promise.resolve(null);
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Helper to run a SQL query returning multiple rows.
 */
export function all(sql, params = []) {
  if (useInMemoryFallback) return Promise.resolve([]);
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Executes schema initialization.
 */
export async function initDatabase() {
  if (isInitialized) return;

  try {
    const schemaPath = path.resolve(__dirname, './schema.sql');
    let schemaSql = '';

    if (fs.existsSync(schemaPath)) {
      schemaSql = fs.readFileSync(schemaPath, 'utf8');
    } else {
      schemaSql = `
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            external_user_id TEXT NOT NULL,
            user_name TEXT,
            mode TEXT NOT NULL DEFAULT 'bot',
            status TEXT NOT NULL DEFAULT 'active',
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, external_user_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            platform_message_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
      `;
    }

    const db = getDb();
    if (useInMemoryFallback) {
      isInitialized = true;
      return;
    }

    await new Promise((resolve, reject) => {
      db.exec(schemaSql, (err) => {
        if (err) {
          console.error('[DB] Error applying schema:', err.message);
          useInMemoryFallback = true;
          resolve();
        } else {
          console.log('[DB] Database schema ready.');
          isInitialized = true;
          resolve();
        }
      });
    });
  } catch (e) {
    console.warn('[DB] Schema init error, using memory fallback:', e.message);
    useInMemoryFallback = true;
    isInitialized = true;
  }
}

// ==========================================
// Conversation Operations
// ==========================================

export async function getOrCreateConversation(platform, externalUserId, userName = null) {
  await initDatabase();

  if (useInMemoryFallback) {
    let convo = inMemoryStore.conversations.find(
      (c) => c.platform === platform && c.external_user_id === String(externalUserId)
    );
    if (!convo) {
      convo = {
        id: inMemoryStore.nextConvoId++,
        platform,
        external_user_id: String(externalUserId),
        user_name: userName || `User (${platform.substring(0, 2).toUpperCase()}-${String(externalUserId).slice(-4)})`,
        mode: 'bot',
        status: 'active',
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      inMemoryStore.conversations.unshift(convo);
    } else if (userName) {
      convo.user_name = userName;
    }
    return convo;
  }

  let conversation = await get(
    `SELECT * FROM conversations WHERE platform = ? AND external_user_id = ?`,
    [platform, String(externalUserId)]
  );

  if (!conversation) {
    const result = await run(
      `INSERT INTO conversations (platform, external_user_id, user_name, mode, status, last_message_at, updated_at)
       VALUES (?, ?, ?, 'bot', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [platform, String(externalUserId), userName || `User (${platform.substring(0, 2).toUpperCase()}-${String(externalUserId).slice(-4)})`]
    );
    conversation = await get(`SELECT * FROM conversations WHERE id = ?`, [result.lastID]);
  } else if (userName && conversation.user_name !== userName) {
    await run(
      `UPDATE conversations SET user_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userName, conversation.id]
    );
    conversation.user_name = userName;
  }

  return conversation;
}

export async function getConversationById(id) {
  await initDatabase();
  if (useInMemoryFallback) {
    return inMemoryStore.conversations.find((c) => c.id === parseInt(id, 10)) || null;
  }
  return await get(`SELECT * FROM conversations WHERE id = ?`, [id]);
}

export async function getAllConversations() {
  await initDatabase();

  if (useInMemoryFallback) {
    return inMemoryStore.conversations.map((c) => {
      const msgs = inMemoryStore.messages.filter((m) => m.conversation_id === c.id);
      const lastMsg = msgs[msgs.length - 1];
      return {
        ...c,
        last_message: lastMsg ? lastMsg.text : null,
        last_sender: lastMsg ? lastMsg.sender : null,
        last_message_time: lastMsg ? lastMsg.created_at : c.updated_at,
      };
    });
  }

  const sql = `
    SELECT 
      c.*,
      m.text AS last_message,
      m.sender AS last_sender,
      m.created_at AS last_message_time
    FROM conversations c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages 
      WHERE conversation_id = c.id 
      ORDER BY created_at DESC, id DESC 
      LIMIT 1
    )
    ORDER BY c.last_message_at DESC, c.updated_at DESC
  `;
  return await all(sql);
}

export async function updateConversationMode(id, mode) {
  await initDatabase();
  if (!['bot', 'human'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be 'bot' or 'human'.`);
  }

  if (useInMemoryFallback) {
    const convo = inMemoryStore.conversations.find((c) => c.id === parseInt(id, 10));
    if (convo) {
      convo.mode = mode;
      convo.updated_at = new Date().toISOString();
      return convo;
    }
    return null;
  }

  await run(
    `UPDATE conversations SET mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [mode, id]
  );
  return await getConversationById(id);
}

// ==========================================
// Message Operations
// ==========================================

export async function saveMessage(conversationId, sender, text, platformMessageId = null) {
  await initDatabase();

  if (useInMemoryFallback) {
    const msg = {
      id: inMemoryStore.nextMsgId++,
      conversation_id: parseInt(conversationId, 10),
      sender,
      text,
      platform_message_id: platformMessageId,
      created_at: new Date().toISOString(),
    };
    inMemoryStore.messages.push(msg);

    const convo = inMemoryStore.conversations.find((c) => c.id === parseInt(conversationId, 10));
    if (convo) {
      convo.last_message_at = msg.created_at;
      convo.updated_at = msg.created_at;
    }
    return msg;
  }

  const result = await run(
    `INSERT INTO messages (conversation_id, sender, text, platform_message_id, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [conversationId, sender, text, platformMessageId]
  );

  await run(
    `UPDATE conversations 
     SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [conversationId]
  );

  return await get(`SELECT * FROM messages WHERE id = ?`, [result.lastID]);
}

export async function getRecentMessages(conversationId, limit = 10) {
  await initDatabase();

  if (useInMemoryFallback) {
    const msgs = inMemoryStore.messages.filter((m) => m.conversation_id === parseInt(conversationId, 10));
    return msgs.slice(-limit);
  }

  return await all(
    `SELECT * FROM (
       SELECT * FROM messages 
       WHERE conversation_id = ? 
       ORDER BY created_at DESC, id DESC 
       LIMIT ?
     ) ORDER BY created_at ASC, id ASC`,
    [conversationId, limit]
  );
}

export async function getConversationMessages(conversationId) {
  await initDatabase();

  if (useInMemoryFallback) {
    return inMemoryStore.messages.filter((m) => m.conversation_id === parseInt(conversationId, 10));
  }

  return await all(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    [conversationId]
  );
}
