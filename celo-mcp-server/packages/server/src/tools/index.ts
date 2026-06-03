import { get_balanceTool }        from './get_balance.js';
import { send_tokensTool }        from './send_tokens.js';
import { swap_tokensTool }        from './swap_tokens.js';
import { lend_on_aaveTool }       from './lend_on_aave.js';
import { self_verifyTool }        from './self_verify.js';
import { self_agent_idTool }      from './self_agent_id.js';
import { x402_payTool }           from './x402_pay.js';
import { get_transactionTool }    from './get_transaction.js';
import { get_token_priceTool }    from './get_token_price.js';

export const allTools = [
  get_balanceTool,
  send_tokensTool,
  swap_tokensTool,
  lend_on_aaveTool,
  self_verifyTool,
  self_agent_idTool,
  x402_payTool,
  get_transactionTool,
  get_token_priceTool,
];
