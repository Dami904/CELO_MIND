import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col bg-dark text-text select-none">
      {/* Hero Section with radial gradient background */}
      <section className="relative py-14 px-6 md:py-20 md:px-12 flex flex-col items-center text-center overflow-hidden border-b border-border bg-[radial-gradient(circle_at_center,rgba(251,204,92,0.06)_0%,transparent_65%)]">
        {/* Brutalist badge */}
        <div className="mb-6 px-3 py-1 bg-border2 border border-border text-cy text-[10px] uppercase tracking-widest font-mono font-bold">
          ✦ Open-source MCP
        </div>
        
        {/* Massive Syne Heading */}
        <h1 className="max-w-3xl font-syne font-extrabold text-3xl md:text-5xl lg:text-6xl text-text leading-tight tracking-tight uppercase mb-6">
          NATIVE WEB3 CAPABILITIES FOR AI AGENTS
        </h1>
        
        <p className="max-w-xl text-muted text-xs md:text-sm font-mono leading-relaxed mb-8 lowercase">
          bridging artificial intelligence with the celo network. enable any llm to read chain states, manage tokens, and broadcast transactions using standard model context protocol.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm justify-center">
          <Link
            href="/dashboard"
            className="flex-1 py-3 px-6 text-center text-xs font-mono uppercase tracking-wider font-bold bg-cy text-dark border border-cy hover:bg-transparent hover:text-cy transition-all cursor-pointer"
          >
            Open Dashboard
          </Link>
          <Link
            href="/chat"
            className="flex-1 py-3 px-6 text-center text-xs font-mono uppercase tracking-wider font-bold bg-transparent text-text border border-border hover:border-cy hover:text-cy transition-all cursor-pointer"
          >
            Try Chat Agent
          </Link>
        </div>
      </section>

      {/* 4-column Stats Bar */}
      <section className="grid grid-cols-2 md:grid-cols-4 bg-border2 gap-[1px] border-b border-border text-center font-mono">
        <div className="bg-dark py-4 px-6">
          <span className="block text-[10px] text-muted uppercase">ACTIVE MCP TOOLS</span>
          <span className="block text-base font-bold text-cy mt-0.5">18 NATIVE</span>
        </div>
        <div className="bg-dark py-4 px-6">
          <span className="block text-[10px] text-muted uppercase">AVG EXECUTION</span>
          <span className="block text-base font-bold text-cg mt-0.5">1.2 SEC</span>
        </div>
        <div className="bg-dark py-4 px-6">
          <span className="block text-[10px] text-muted uppercase">SUPPORTED LLMS</span>
          <span className="block text-base font-bold text-text mt-0.5">CLAUDE / GPT / GEMINI</span>
        </div>
        <div className="bg-dark py-4 px-6">
          <span className="block text-[10px] text-muted uppercase">RPC LATENCY</span>
          <span className="block text-base font-bold text-cg mt-0.5">3ms</span>
        </div>
      </section>

      {/* 3-column Features Grid */}
      <section className="p-8 md:p-12 border-b border-border">
        <h2 className="text-center font-syne font-bold text-xs uppercase tracking-wider text-muted mb-10">
          CORE CAPABILITIES
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="bg-surface border border-border2 p-6 transition-all hover:border-cy flex flex-col gap-4">
            <div className="text-cy text-xl font-mono font-bold">[01]</div>
            <h3 className="font-syne font-bold text-sm uppercase text-text tracking-wide">Wallet Intelligence</h3>
            <p className="text-muted text-xs leading-relaxed font-sans">
              Autonomous agents query wallet holdings, inspect transaction histories, check smart contract source metadata, and verify ERC-20 allowances on-chain.
            </p>
          </div>
          {/* Feature 2 */}
          <div className="bg-surface border border-border2 p-6 transition-all hover:border-cy flex flex-col gap-4">
            <div className="text-cy text-xl font-mono font-bold">[02]</div>
            <h3 className="font-syne font-bold text-sm uppercase text-text tracking-wide">DeFi Execution</h3>
            <p className="text-muted text-xs leading-relaxed font-sans">
              Broadcast token transfers, trigger token swaps via Uniswap/Ubeswap, deposit collateral, and coordinate multi-signature transactions seamlessly.
            </p>
          </div>
          {/* Feature 3 */}
          <div className="bg-surface border border-border2 p-6 transition-all hover:border-cy flex flex-col gap-4">
            <div className="text-cy text-xl font-mono font-bold">[03]</div>
            <h3 className="font-syne font-bold text-sm uppercase text-text tracking-wide">Risk & Detection</h3>
            <p className="text-muted text-xs leading-relaxed font-sans">
              Monitors high-value whale movements, flags malicious transaction signatures, and verifies code safety using real-time contract scanners.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture Flow Diagram */}
      <section className="p-8 md:p-12 bg-dark/50 flex flex-col items-center">
        <h2 className="font-syne font-bold text-[10px] uppercase tracking-widest text-muted mb-8">
          MCP INFRASTRUCTURE ARCHITECTURE
        </h2>
        <div className="w-full max-w-3xl flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs">
          <div className="w-full md:w-auto p-4 border border-border2 bg-surface text-center flex-1">
            <span className="block text-muted text-[10px]">INPUT LAYER</span>
            <span className="block font-bold mt-1 text-text uppercase">LLM / Client UI</span>
          </div>
          
          <div className="text-cy font-bold font-mono text-sm py-1 md:py-0">↔</div>
          
          <div className="w-full md:w-auto p-4 border border-border bg-surface text-center flex-1">
            <span className="block text-cy text-[10px] font-bold">PROTOCOL GATEWAY</span>
            <span className="block font-bold mt-1 text-text uppercase">CeloMind MCP</span>
          </div>
          
          <div className="text-cy font-bold font-mono text-sm py-1 md:py-0">↔</div>
          
          <div className="w-full md:w-auto p-4 border border-border2 bg-surface text-center flex-1">
            <span className="block text-muted text-[10px]">BLOCKCHAIN RPC</span>
            <span className="block font-bold mt-1 text-text uppercase">Celo Node API</span>
          </div>
        </div>
      </section>
    </div>
  );
}
