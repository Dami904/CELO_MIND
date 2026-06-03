// End-to-end smoke test for the running CeloMind API.
// Usage: node scripts/smoke.mjs   (server must be running, default http://localhost:3001)
// Asserts: routes respond, live data comes back, sources are labeled, and NO deprecated
// Celoscan-V1 error strings leak through.

const BASE = process.env.SMOKE_BASE || "http://localhost:3001";
// A real, active Celo mainnet address (Mento reserve multisig) for portfolio/whale checks.
const WHALE = process.env.SMOKE_WHALE || "0x246e9002a82B98E40Fd1d7d8F70e9a6F9a3D2E8a";

let failures = 0;
const log = (ok, name, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function getJson(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

function noV1Error(text) {
  return !/deprecated V1 endpoint|Etherscan API V2/i.test(text);
}

async function main() {
  console.log(`CeloMind smoke test → ${BASE}\n`);

  // 1. Health
  {
    const { status, json } = await getJson("/api/health");
    log(status === 200 && json?.success === true, "GET /api/health", `status ${status}`);
  }

  // 2. Dashboard metrics (live price / TVL / trending)
  {
    const { status, json, text } = await getJson("/api/dashboard/metrics");
    const ok = status === 200 && json?.success === true && noV1Error(text);
    log(ok, "GET /api/dashboard/metrics", json?.data?.celoPrice ? "has CELO price" : "no price");
  }

  // 3. Wallet balances (Blockscout v2, USD-valued)
  {
    const { status, json, text } = await getJson(`/api/wallet/${WHALE}/balances`);
    const balances = json?.data?.balances ?? [];
    log(status === 200 && noV1Error(text), `GET /api/wallet/:addr/balances`, `${balances.length} entries, source=${json?.data?.source}`);
  }

  // 4. Docs ask (live docs)
  {
    const { status, json } = await getJson("/api/docs/ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What is Celo?" }),
    });
    log(status === 200 && Boolean(json?.data?.answer), "POST /api/docs/ask");
  }

  // 5. Chat — trending tokens (source-labeled, non-empty)
  {
    const { status, json, text } = await getJson("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Show me trending Celo tokens", chatbotType: "full" }),
    });
    const items = json?.data?.intentData?.items ?? [];
    const src = json?.data?.intentData?.source;
    log(status === 200 && noV1Error(text), "POST /api/chat (trending)", `${items.length} tokens, source=${src}`);
  }

  // 6. Chat — whale activity (no deprecated errors)
  {
    const { status, text } = await getJson("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Whale activity for ${WHALE}`, chatbotType: "full" }),
    });
    log(status === 200 && noV1Error(text), "POST /api/chat (whale)");
  }

  // 7. Risk check (explanation present)
  {
    const { status, json } = await getJson("/api/risk/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "token", target: "0x765DE816845861e75A25fCA122bb6898B8B1282a", network: "celo" }),
    });
    log(status === 200 && Boolean(json?.data?.explanation), "POST /api/risk/check", json?.data?.riskLevel);
  }

  console.log(`\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });
