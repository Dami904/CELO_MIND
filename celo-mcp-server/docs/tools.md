# Tool Reference

| Tool                | Inputs                                     | Returns                          |
|---------------------|--------------------------------------------|----------------------------------|
| get_balance         | address, token?                            | balance, symbol, raw             |
| send_tokens         | to, amount, token                          | txHash, explorerUrl              |
| swap_tokens         | tokenIn, tokenOut, amountIn, slippage      | txHash, amountOut                |
| lend_on_aave        | action, token, amount                      | txHash, apy                      |
| self_verify         | proof, publicSignals, scope                | verified, nullifier              |
| self_agent_id_check | agentAddress                               | verified, score, credentials     |
| x402_pay            | url, maxAmount, token                      | response, txHash                 |
| get_transaction     | txHash                                     | status, blockNumber, gasUsed     |
| get_token_price     | symbol                                     | price, currency, timestamp       |
