import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// ── Input schema ───────────────────────────────────────────────
const schema = z.object({
  // TODO: define inputs for lend_on_aave
  placeholder: z.string().describe('Replace with real inputs'),
});

// ── Handler ────────────────────────────────────────────────────
async function handler(input: z.infer<typeof schema>) {
  // TODO: implement lend_on_aave
  return { content: [{ type: 'text' as const, text: 'Not yet implemented' }] };
}

// ── Export ─────────────────────────────────────────────────────
export const lend_on_aaveTool: ToolDefinition = {
  name:        'lend_on_aave',
  description: 'Supply, borrow, or withdraw on Aave V3 Celo',
  schema,
  handler,
};
