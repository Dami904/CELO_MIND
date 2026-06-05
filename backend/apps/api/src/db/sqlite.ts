import { createClient, type Client } from "@libsql/client";

// Accepts a local file path (default) or a hosted Turso/libsql URL.
// libsql://, https://, ws:// (+ file:) are used verbatim; a bare path becomes file:.
// For Turso, also set DATABASE_AUTH_TOKEN so logs persist beyond an ephemeral disk.
function resolveDbConfig(): { url: string; authToken?: string } {
  const raw = process.env.DATABASE_URL ?? "./celomind.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const url = /^(libsql|https?|wss?|file):/.test(raw) ? raw : `file:${raw}`;
  return authToken ? { url, authToken } : { url };
}

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = createClient(resolveDbConfig());
  }
  return _client;
}

export async function initDb(): Promise<void> {
  const db = getClient();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      wallet_address TEXT,
      network TEXT,
      request_summary TEXT,
      response_summary TEXT,
      tx_hash TEXT,
      risk_score INTEGER,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      tx_hash TEXT,
      network TEXT,
      type TEXT,
      amount TEXT,
      token TEXT,
      to_address TEXT,
      status TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT,
      chatbot_type TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      intent TEXT,
      wallet_address TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_conversation_summaries (
      scope_key TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      conversation_id TEXT,
      wallet_address TEXT,
      chatbot_type TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watched_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL UNIQUE,
      label TEXT,
      network TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_checked TEXT
    );

    CREATE TABLE IF NOT EXISTS risk_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      type TEXT NOT NULL,
      risk_level TEXT,
      risk_score INTEGER,
      flags TEXT,
      network TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      network TEXT,
      snapshot TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS chat_messages_wallet_idx ON chat_messages(wallet_address);
    CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS chat_messages_timestamp_idx ON chat_messages(timestamp);
    CREATE INDEX IF NOT EXISTS chat_conversation_summaries_conversation_idx ON chat_conversation_summaries(conversation_id);
    CREATE INDEX IF NOT EXISTS chat_conversation_summaries_wallet_idx ON chat_conversation_summaries(wallet_address);
  `);
}

export type ToolCallLog = {
  toolName: string;
  walletAddress?: string;
  network?: string;
  requestSummary?: string;
  responseSummary?: string;
  txHash?: string;
  riskScore?: number;
};

export async function logToolCall(log: ToolCallLog): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: `INSERT INTO tool_calls (tool_name, wallet_address, network, request_summary, response_summary, tx_hash, risk_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [log.toolName, log.walletAddress ?? null, log.network ?? null, log.requestSummary ?? null, log.responseSummary ?? null, log.txHash ?? null, log.riskScore ?? null],
    });
  } catch { /* non-fatal logging failure */ }
}

export async function logChatMessage(msg: {
  conversationId?: string;
  chatbotType: string;
  role: string;
  content: string;
  intent?: string;
  walletAddress?: string;
}): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: `INSERT INTO chat_messages (conversation_id, chatbot_type, role, content, intent, wallet_address)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [msg.conversationId ?? null, msg.chatbotType, msg.role, msg.content, msg.intent ?? null, msg.walletAddress ?? null],
    });
  } catch { /* non-fatal */ }
}

export type ChatMessageRecord = {
  id: number;
  conversationId: string | null;
  chatbotType: string;
  role: string;
  content: string;
  intent: string | null;
  walletAddress: string | null;
  timestamp: string;
};

export type ChatSummaryScope = {
  conversationId?: string;
  walletAddress?: string;
  chatbotType: string;
};

export function getChatSummaryScopeKey(scope: ChatSummaryScope): string | null {
  const conversationId = scope.conversationId?.trim();
  if (conversationId) return `conversation:${conversationId}`;

  const walletAddress = scope.walletAddress?.trim();
  if (walletAddress) return `wallet:${walletAddress.toLowerCase()}:${scope.chatbotType}`;

  return null;
}

export async function getChatMessages(filters: {
  walletAddress?: string;
  conversationId?: string;
  chatbotType?: string;
  limit?: number;
}): Promise<ChatMessageRecord[]> {
  try {
    const db = getClient();
    const where: string[] = [];
    const args: (string | number)[] = [];

    if (filters.walletAddress) {
      where.push("lower(wallet_address) = lower(?)");
      args.push(filters.walletAddress);
    }

    if (filters.conversationId) {
      where.push("conversation_id = ?");
      args.push(filters.conversationId);
    }

    if (filters.chatbotType) {
      where.push("chatbot_type = ?");
      args.push(filters.chatbotType);
    }

    const limit = Math.max(1, Math.min(filters.limit ?? 200, 1000));
    const sql = `
      SELECT
        id,
        conversation_id AS conversationId,
        chatbot_type AS chatbotType,
        role,
        content,
        intent,
        wallet_address AS walletAddress,
        timestamp
      FROM chat_messages
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY datetime(timestamp) DESC, id DESC
      LIMIT ?
    `;

    const result = await db.execute({
      sql,
      args: [...args, limit],
    });

    return result.rows.map((row) => ({
      id: Number(row.id ?? 0),
      conversationId: (row.conversationId as string | null) ?? null,
      chatbotType: String(row.chatbotType ?? ""),
      role: String(row.role ?? ""),
      content: String(row.content ?? ""),
      intent: (row.intent as string | null) ?? null,
      walletAddress: (row.walletAddress as string | null) ?? null,
      timestamp: String(row.timestamp ?? ""),
    }));
  } catch {
    return [];
  }
}

export async function getChatConversationSummary(scope: ChatSummaryScope): Promise<string | null> {
  try {
    const scopeKey = getChatSummaryScopeKey(scope);
    if (!scopeKey) return null;

    const db = getClient();
    const result = await db.execute({
      sql: `SELECT summary FROM chat_conversation_summaries WHERE scope_key = ? LIMIT 1`,
      args: [scopeKey],
    });

    const summary = String(result.rows[0]?.summary ?? "").trim();
    return summary || null;
  } catch {
    return null;
  }
}

export async function upsertChatConversationSummary(scope: ChatSummaryScope, summary: string): Promise<void> {
  try {
    const scopeKey = getChatSummaryScopeKey(scope);
    const cleaned = summary.trim();
    if (!scopeKey || !cleaned) return;

    const db = getClient();
    const conversationId = scope.conversationId?.trim() || null;
    const walletAddress = scope.walletAddress?.trim()?.toLowerCase() || null;
    const scopeType = conversationId ? "conversation" : "wallet";

    await db.execute({
      sql: `
        INSERT INTO chat_conversation_summaries (scope_key, scope_type, conversation_id, wallet_address, chatbot_type, summary, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(scope_key) DO UPDATE SET
          scope_type = excluded.scope_type,
          conversation_id = excluded.conversation_id,
          wallet_address = excluded.wallet_address,
          chatbot_type = excluded.chatbot_type,
          summary = excluded.summary,
          updated_at = datetime('now')
      `,
      args: [scopeKey, scopeType, conversationId, walletAddress, scope.chatbotType, cleaned],
    });
  } catch { /* non-fatal */ }
}

export async function addWatchedWallet(address: string, label?: string, network?: string): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: `INSERT OR REPLACE INTO watched_wallets (address, label, network) VALUES (?, ?, ?)`,
      args: [address.toLowerCase(), label ?? null, network ?? "celo"],
    });
  } catch { /* non-fatal */ }
}

export async function logRiskCheck(data: {
  target: string;
  type: string;
  riskLevel: string;
  riskScore: number;
  flags: string[];
  network: string;
}): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: `INSERT INTO risk_checks (target, type, risk_level, risk_score, flags, network) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [data.target, data.type, data.riskLevel, data.riskScore, JSON.stringify(data.flags), data.network],
    });
  } catch { /* non-fatal */ }
}

export async function logPortfolioSnapshot(walletAddress: string, network: string, snapshot: unknown): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: `INSERT INTO portfolio_snapshots (wallet_address, network, snapshot) VALUES (?, ?, ?)`,
      args: [walletAddress, network, JSON.stringify(snapshot)],
    });
  } catch { /* non-fatal */ }
}
