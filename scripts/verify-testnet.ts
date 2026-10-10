// Re-fetches every cited fact of the on-chain mock launches from the real Elysium testnet RPC and records the results
// to data/testnet/<SYMBOL>.fetches.json. The site replays these so pages load instantly; `?live=1` re-verifies live.
//   npm run verify:testnet
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { RecordingSource } from "../src/chain/cached";
import { RpcSource } from "../src/chain/live";
import { computeFindings } from "../src/engine/analyze";
import { configFor } from "../src/engine/config";
import { verifyFindings } from "../src/engine/verifier";
import type { Dataset } from "../src/engine/types";

const rpc = process.env.ELYSIUM_VERIFIER_RPC_URL || process.env.ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz";
for (const f of readdirSync("data/testnet").filter((x) => x.endsWith(".json") && !x.includes(".fetches."))) {
  const ds = JSON.parse(readFileSync(`data/testnet/${f}`, "utf8")).dataset as Dataset;
  const rec = new RecordingSource(new RpcSource(99801, rpc, "Elysium testnet RPC", true), rpc);
  const { findings } = computeFindings(ds, configFor(ds.profile));
  const out = await verifyFindings(findings, rec, { 99801: rpc });
  writeFileSync(`data/testnet/${ds.token.symbol}.fetches.json`, JSON.stringify(rec.rec));
  console.log(ds.token.symbol, out.map((x) => `${x.signal}:${x.status}`).join(" "));
  for (const x of out.filter((y) => y.status === "withheld")) console.log("  ", x.withheldReason?.slice(0, 200));
}
