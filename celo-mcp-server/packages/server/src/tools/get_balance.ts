import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// ── Input schema ───────────────────────────────────────────────
const schema = z.object({
  // TODO: define inputs for get_balance
  placeholder: z.string().describe('Replace with real inputs'),
});

// ── Handler ────────────────────────────────────────────────────
async function handler(input: z.infer<typeof schema>) {
  // TODO: implement get_balance
  return { content: [{ type: 'text' as const, text: 'Not yet implemented' }] };
}

// ── Export ─────────────────────────────────────────────────────
export const get_balanceTool: ToolDefinition = {
  name:        'get_balance',
  description: 'Get CELO / cUSD / any ERC-20 balance for an address',
  schema,
  handler,
};
