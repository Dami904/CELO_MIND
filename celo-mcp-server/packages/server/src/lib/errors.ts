export class CeloMcpError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CeloMcpError';
  }
}

export class WalletNotConfiguredError extends CeloMcpError {
  constructor() { super('WALLET_NOT_CONFIGURED', 'PRIVATE_KEY is not set in environment'); }
}

export class TokenNotFoundError extends CeloMcpError {
  constructor(symbol: string) { super('TOKEN_NOT_FOUND', \Token "\" not found in registry\); }
}
