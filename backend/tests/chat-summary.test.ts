import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("chat conversation summaries", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_AUTH_TOKEN;
  });

  it("builds stable scope keys", async () => {
    const { getChatSummaryScopeKey } = await import("../apps/api/src/db/sqlite.js");

    expect(getChatSummaryScopeKey({ conversationId: "conv-1", chatbotType: "full" })).toBe("conversation:conv-1");
    expect(getChatSummaryScopeKey({ walletAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12", chatbotType: "docs" }))
      .toBe("wallet:0xabcdef1234567890abcdef1234567890abcdef12:docs");
    expect(getChatSummaryScopeKey({ chatbotType: "full" })).toBeNull();
  });

  it("stores and retrieves a summary for a conversation", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "celomind-summary-")), "chat.db");
    process.env.DATABASE_URL = dbPath;

    const { initDb, getChatConversationSummary, upsertChatConversationSummary } = await import("../apps/api/src/db/sqlite.js");
    await initDb();

    const scope = { conversationId: "conv-42", chatbotType: "full" };

    await upsertChatConversationSummary(scope, "User wants to track whales and compare wallet activity.");
    expect(await getChatConversationSummary(scope)).toBe("User wants to track whales and compare wallet activity.");

    await upsertChatConversationSummary(scope, "User now wants a swap quote and a reminder to confirm in wallet.");
    expect(await getChatConversationSummary(scope)).toBe("User now wants a swap quote and a reminder to confirm in wallet.");
  });
});
