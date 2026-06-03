import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// ── Input schema ───────────────────────────────────────────────
const schema = z.object({
  // TODO: define inputs for get_token_price
  placeholder: z.string().describe('Replace with real inputs'),
});

// ── Handler ────────────────────────────────────────────────────
async function handler(input: z.infer<typeof schema>) {
  // TODO: implement get_token_price
  return { content: [{ type: 'text' as const, text: 'Not yet implemented' }] };
}

// ── Export ─────────────────────────────────────────────────────
export const get_token_priceTool: ToolDefinition = {
  name:        'get_token_price',
  description: 'Get live token price from CoinGecko free tier',
  schema,
  handler,
};
