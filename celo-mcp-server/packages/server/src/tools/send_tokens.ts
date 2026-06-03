import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// ── Input schema ───────────────────────────────────────────────
const schema = z.object({
  // TODO: define inputs for send_tokens
  placeholder: z.string().describe('Replace with real inputs'),
});

// ── Handler ────────────────────────────────────────────────────
async function handler(input: z.infer<typeof schema>) {
  // TODO: implement send_tokens
  return { content: [{ type: 'text' as const, text: 'Not yet implemented' }] };
}

// ── Export ─────────────────────────────────────────────────────
export const send_tokensTool: ToolDefinition = {
  name:        'send_tokens',
  description: 'Send CELO or any ERC-20 token to an address',
  schema,
  handler,
};
