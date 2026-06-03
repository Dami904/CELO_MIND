// Bundles the runnable apps (API server + MCP server) with esbuild.
// Workspace packages (@celomind/*) are inlined from source; npm deps are kept
// external and resolved from node_modules at runtime. This sidesteps the
// per-package tsc rootDir constraint while producing real runnable dist/ output.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Inline relative imports + @celomind/* workspace packages; externalize the rest. */
const externalizeNpm = {
  name: "externalize-npm",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return;
      if (args.path.startsWith(".") || args.path.startsWith("@celomind/")) return;
      return { path: args.path, external: true };
    });
  },
};

const targets = [
  { entry: "apps/api/src/server.ts", outfile: "apps/api/dist/server.js" },
  { entry: "packages/mcp-server/src/index.ts", outfile: "packages/mcp-server/dist/index.js" },
];

for (const t of targets) {
  await build({
    entryPoints: [resolve(root, t.entry)],
    outfile: resolve(root, t.outfile),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
    plugins: [externalizeNpm],
    logLevel: "info",
    // Preserve import.meta and dynamic import() used by the AI provider layer.
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
  console.log(`✓ built ${t.outfile}`);
}
