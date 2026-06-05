import { describe, it, expect, vi, beforeEach } from "vitest";

const { getChatMessagesMock } = vi.hoisted(() => ({
  getChatMessagesMock: vi.fn(),
}));

vi.mock("../apps/api/src/db/sqlite.js", () => ({
  getChatMessages: getChatMessagesMock,
  logChatMessage: vi.fn(),
}));

import { buildChatMemory } from "../apps/api/src/routes/chat.js";

describe("buildChatMemory", () => {
  beforeEach(() => {
    getChatMessagesMock.mockReset();
  });

  it("loads the latest turns in chronological order", async () => {
    getChatMessagesMock.mockResolvedValue([
      { role: "assistant", content: "second" },
      { role: "user", content: "first" },
      { role: "system", content: "ignore" },
    ]);

    const memory = await buildChatMemory({
      conversationId: "conv-1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      chatbotType: "full",
    });

    expect(getChatMessagesMock).toHaveBeenCalledWith({
      conversationId: "conv-1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      chatbotType: "full",
      limit: 8,
    });
    expect(memory).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ]);
  });

  it("returns an empty memory window when there is no conversation scope", async () => {
    const memory = await buildChatMemory({ chatbotType: "full" });

    expect(memory).toEqual([]);
    expect(getChatMessagesMock).not.toHaveBeenCalled();
  });
});
