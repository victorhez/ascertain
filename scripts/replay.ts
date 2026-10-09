// Replay mode: run the engine and verifier on a REAL token (HyperEVM mainnet 999 or Elysium testnet 99801).
// ERC-20 adapter: reads Transfer logs, computes holder concentration, verifies every cited fact through a
// second RPC. Pool/funding signals need the pool adapter and a funding index, so they are reported as not computed.
//   npm run replay -- --chain 999 --token 0x... --blocks 20000
import { mkdirSync, writeFileSync } from "node:fs";
import { parseAbiItem } from "viem";
import { CHAINS, RpcSource, clientFor } from "../src/chain/live";
import { lc } from "../src/chain/codec";
import { buildLedger } from "../src/engine/ledger";
import { concentration } from "../src/engine/signals";
import { digestOf } from "../src/engine/canonical";
import { verifyFindings } from "../src/engine/verifier";
import type { Dataset, Finding, RawLog } from "../src/engine/types";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const chainId = Number(arg("chain", "999")) as keyof typeof CHAINS;
const token = lc(arg("token") ?? (() => { throw new Error("--token required"); })());
const span = Number(arg("blocks", "20000"));
const chunk = Number(arg("chunk", "1000"));
const cfg = CHAINS[chainId];
const client = clientFor(chainId);

const head = Number(await client.getBlockNumber()) - 2;
const from = Math.max(0, head - span);
const logs: RawLog[] = [];
for (let b = from; b <= head; b += chunk) {
  await new Promise((r) => setTimeout(r, 300));
  const ls = await client.getLogs({ address: token, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), fromBlock: BigInt(b), toBlock: BigInt(Math.min(head, b + chunk - 1)) });
  for (const l of ls) logs.push({ chainId, blockNumber: Number(l.blockNumber), txHash: l.transactionHash!, logIndex: l.logIndex!, address: lc(l.address), topics: [...l.topics] as `0x${string}`[], data: l.data });
}
console.log(`scanned blocks ${from}..${head}: ${logs.length} Transfer logs`);

const decimals = await client.readContract({ address: token, abi: [parseAbiItem("function decimals() view returns (uint8)")], functionName: "decimals" }).catch(() => 18);
const ds: Dataset = {
  token: { address: token, chainId, chainName: cfg.name, symbol: token.slice(0, 8), name: token, decimals: Number(decimals), launchBlock: from, poolAddress: "0x0000000000000000000000000000000000000000", deployer: token, quoteAsset: { symbol: "n/a", address: token, decimals: 6 }, source: "rpc", summary: "Replay (ERC-20 adapter)" },
  headBlock: head, blockSeconds: 1, launchTimestamp: 0, logs, fundingTxs: [], nonces: {},
};
const L = buildLedger(ds);
const out = concentration(L);
const f: Finding = { id: "fnd_" + digestOf([token, "concentration", out.value]).slice(0, 12), token, signal: "concentration", title: out.title, ruleVersion: "concentration@1.0.0", summary: out.summary, value: out.value, evidence: out.evidence, evidenceTotal: out.evidence.length, evidenceDigest: digestOf(out.evidence.map((e) => e.raw)), status: "withheld" };

const verifierUrl = cfg.verifierRpc || cfg.rpc;
if (!cfg.verifierRpc) console.warn("WARNING: no *_VERIFIER_RPC_URL set; verifying against the same RPC is NOT independent.");
const [v] = await verifyFindings([f], new RpcSource(chainId, verifierUrl, verifierUrl), { [chainId]: cfg.rpc });
console.log(v.status, v.status === "withheld" ? v.withheldReason : v.summary);
console.log("Not computed in ERC-20 mode: funding clusters, same-block entry, wash loops, volume (need pool adapter + funding index).");
mkdirSync("evidence", { recursive: true });
const file = `evidence/replay-${chainId}-${token.slice(2, 10)}.json`;
writeFileSync(file, JSON.stringify({ chainId, token, blocks: [from, head], finding: v }, null, 1));
console.log("wrote", file);
