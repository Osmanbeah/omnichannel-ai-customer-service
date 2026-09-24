import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Enable verbose mode for debugging if not in production
const sqlite = sqlite3.verbose();
let dbInstance = null;

/**
 * Initializes the SQLite database connection and runs schema migrations.
 */
export function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = new sqlite.Database(config.db.path, (err) => {
    if (err) {
      console.error('[DB] Failed to connect to SQLite database:', err.message);
    } else {
      console.log(`[DB] Connected to SQLite database at: ${config.db.path}`);
    }
  });

  return dbInstance;
}

/**
 * Helper to run a SQL query that doesn't return rows (INSERT, UPDATE, DELETE).
 */
export function run(sql, params = []) {
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
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Executes schema.sql initialization.
 */
export async function initDatabase() {
  const schemaPath = path.resolve(__dirname, './schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const db = getDb();
  return new Promise((resolve, reject) => {
    db.exec(schemaSql, (err) => {
      if (err) {
        console.error('[DB] Error applying schema.sql:', err.message);
        reject(err);
      } else {
        console.log('[DB] Database schema initialized successfully.');
        resolve();
      }
    });
  });
}

// ==========================================
// Conversation Operations
// ==========================================

/**
 * Finds or creates a conversation record for a user on a given platform.
 */
export async function getOrCreateConversation(platform, externalUserId, userName = null) {
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
    // Update user name if now available
    await run(
      `UPDATE conversations SET user_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userName, conversation.id]
    );
    conversation.user_name = userName;
  }

  return conversation;
}

/**
 * Retrieves a conversation by its primary ID.
 */
export async function getConversationById(id) {
  return await get(`SELECT * FROM conversations WHERE id = ?`, [id]);
}

/**
 * Retrieves all conversations ordered by recent activity, including last message preview.
 */
export async function getAllConversations() {
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

/**
 * Updates the mode of a conversation ('bot' or 'human').
 */
export async function updateConversationMode(id, mode) {
  if (!['bot', 'human'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be 'bot' or 'human'.`);
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

/**
 * Saves a new message and updates the parent conversation's timestamps.
 */
export async function saveMessage(conversationId, sender, text, platformMessageId = null) {
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

/**
 * Gets the last N messages for AI context.
 */
export async function getRecentMessages(conversationId, limit = 10) {
  const rows = await all(
    `SELECT * FROM (
       SELECT * FROM messages 
       WHERE conversation_id = ? 
       ORDER BY created_at DESC, id DESC 
       LIMIT ?
     ) ORDER BY created_at ASC, id ASC`,
    [conversationId, limit]
  );
  return rows;
}

/**
 * Gets all messages for a conversation (for dashboard view).
 */
export async function getConversationMessages(conversationId) {
  return await all(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    [conversationId]
  );
}
