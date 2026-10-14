// Step 1 of real-token replay: download every ERC-20 Transfer of a HyperEVM token via alchemy_getAssetTransfers
// (the free tier caps eth_getLogs at 10 blocks, so logs cannot be scanned directly). Resumable.
//   TOKEN=PURR npx tsx scripts/real-fetch.ts
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { REAL_TOKENS } from "../src/real/tokens";

config({ path: ".env.local" });
const RPC = process.env.HYPEREVM_RPC_URL!;
const which = process.env.TOKEN;
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 20000);

async function rpc(method: string, params: unknown[]) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = (await r.json()) as { result?: any; error?: { message: string; code: number } };
      if (j.result !== undefined) return j.result;
      if (i < 12 && /rate|limit|429|capacity/i.test(j.error?.message ?? "")) { await new Promise((s) => setTimeout(s, 800 * (i + 1))); continue; }
      throw new Error(j.error?.message ?? "rpc error");
    } catch (e) {
      if (i < 12 && /JSON|fetch|network|ECONN|timeout/i.test((e as Error).message)) { await new Promise((s) => setTimeout(s, 1000 * (i + 1))); continue; }
      throw e;
    }
  }
}

mkdirSync("data/real", { recursive: true });
for (const t of REAL_TOKENS.filter((x) => !which || x.symbol === which)) {
  const file = `data/real/${t.symbol}.transfers.json`;
  const state: { pageKey?: string; done: boolean; rows: [number, string, string, string, string][] } = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { done: false, rows: [] };
  if (state.done) { console.log(t.symbol, "already complete", state.rows.length); continue; }
  let pages = 0;
  const t0 = Date.now();
  while (pages++ < MAX_PAGES) {
    const res = await rpc("alchemy_getAssetTransfers", [{ contractAddresses: [t.address], category: ["erc20"], fromBlock: "0x0", maxCount: "0x3e8", order: "asc", ...(state.pageKey ? { pageKey: state.pageKey } : {}) }]);
    for (const x of res.transfers) state.rows.push([parseInt(x.blockNum, 16), x.hash, x.from, x.to, x.rawContract.value]);
    state.pageKey = res.pageKey;
    if (!res.pageKey) { state.done = true; break; }
    if (pages % 20 === 0) { writeFileSync(file, JSON.stringify(state)); console.log(t.symbol, "pages", pages, "transfers", state.rows.length, `${Math.round((Date.now() - t0) / 1000)}s`); }
  }
  writeFileSync(file, JSON.stringify(state));
  console.log(t.symbol, state.done ? "COMPLETE" : "partial", state.rows.length, "transfers");
}
