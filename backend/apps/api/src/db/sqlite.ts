import { createClient, type Client } from "@libsql/client";

const DB_URL = `file:${process.env.DATABASE_URL ?? "./celomind.db"}`;

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = createClient({ url: DB_URL });
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
