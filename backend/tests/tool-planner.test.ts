import { beforeEach, describe, expect, it, vi } from "vitest";
import { planChatTool } from "../apps/api/src/ai/tool-planner.js";
import { aiComplete } from "../apps/api/src/ai/providers.js";

vi.mock("../apps/api/src/ai/providers.js", () => ({
  aiComplete: vi.fn(),
  routeForIntent: vi.fn(() => ({ provider: "groq", model: "planner-test" })),
}));

const mockedAiComplete = vi.mocked(aiComplete);

describe("planChatTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_TOOL_PLANNING;
  });

  it("normalizes common swap aliases from the AI planner into strict tool args", async () => {
    mockedAiComplete.mockResolvedValue({
      text: JSON.stringify({
        intent: "swap_quote",
        args: { tokenIn: "celo", tokenOut: "CUSD", amountIn: "10" },
      }),
      provider: "groq",
      model: "planner-test",
    });

    const plan = await planChatTool({
      message: "how much cUSD would I get for swapping 10 CELO?",
      chatbotType: "full",
    });

    expect(plan.source).toBe("ai_tool_planner");
    expect(plan.intent).toBe("swap_quote");
    expect(plan.args).toMatchObject({ fromToken: "CELO", toToken: "cUSD", amount: "10" });
    expect(plan.clarification).toBeUndefined();
  });

  it("turns invalid write-action planner args into a clarification", async () => {
    mockedAiComplete.mockResolvedValue({
      text: JSON.stringify({
        intent: "send",
        args: { recipientAddress: "0xRecipientAddress", amount: "1", token: "CELO" },
      }),
      provider: "groq",
      model: "planner-test",
    });

    const plan = await planChatTool({
      message: "transfer 1 CELO",
      chatbotType: "full",
    });

    expect(plan.source).toBe("ai_tool_planner");
    expect(plan.intent).toBe("send");
    expect(plan.clarification).toContain("valid recipient address");
  });

  it("falls back to the deterministic router when planning is unavailable", async () => {
    mockedAiComplete.mockRejectedValue(new Error("no provider"));

    const plan = await planChatTool({
      message: "check cUSD balance",
      chatbotType: "full",
    });

    expect(plan.source).toBe("deterministic_router");
    expect(plan.intent).toBe("token_balance");
  });
});
