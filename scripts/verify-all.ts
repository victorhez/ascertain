// Full verification, not a sample: re-reads EVERY Transfer and Swap log and EVERY funding transaction of an on-chain
// mock launch from the Elysium testnet RPC and compares each one byte-for-byte with what Ascertain indexed.
//   npm run verify:all
import { readdirSync, readFileSync } from "node:fs";
import { parseAbiItem } from "viem";
import { SWAP_TOPIC, TRANSFER_TOPIC, canonLog, canonTx, lc } from "../src/chain/codec";
import { RpcSource } from "../src/chain/live";
import type { Dataset, Hex } from "../src/engine/types";

const rpc = process.env.ELYSIUM_VERIFIER_RPC_URL || process.env.ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz";
const src = new RpcSource(99801, rpc, rpc, true);
void parseAbiItem;
let bad = 0, total = 0;
for (const f of readdirSync("data/testnet").filter((x) => x.endsWith(".json") && !x.includes(".fetches."))) {
  const ds = JSON.parse(readFileSync(`data/testnet/${f}`, "utf8")).dataset as Dataset;
  let n = 0, mismatched = 0;
  for (const l of ds.logs) {
    const got = await src.getLog(99801, l.txHash as Hex, l.logIndex);
    n++; total++;
    if (!got || canonLog(got) !== canonLog(l)) { mismatched++; bad++; }
  }
  for (const t of ds.fundingTxs) {
    const got = await src.getTx(99801, t.hash);
    n++; total++;
    if (!got || canonTx(got) !== canonTx(t)) { mismatched++; bad++; }
  }
  console.log(`${ds.token.symbol}: ${n} facts (${ds.logs.length} logs + ${ds.fundingTxs.length} funding txs), ${mismatched} mismatches`);
}
void SWAP_TOPIC; void TRANSFER_TOPIC; void lc;
console.log(bad === 0 ? `\nAll ${total} facts re-fetched identically.` : `\n${bad} of ${total} facts differ.`);
process.exit(bad ? 1 : 0);
