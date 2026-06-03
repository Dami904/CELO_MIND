import { z } from 'zod';

export interface ToolDefinition {
  name:        string;
  description: string;
  schema:      z.ZodObject<any>;
  handler:     (input: any) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}
