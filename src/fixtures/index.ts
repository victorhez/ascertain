import { lc } from "@/chain/codec";
import { RULE_VERSIONS } from "@/engine/config";
import { buildLedger } from "@/engine/ledger";
import { sample } from "@/engine/evidence";
import type { Address, Dataset, Hex, RawLog } from "@/engine/types";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ChainSource } from "@/chain/source";
import { RpcSource } from "@/chain/live";
import { CachedSource, type Fetches } from "@/chain/cached";
import { FixtureChain } from "./chain";
import { generate, type GroundTruth } from "./generate";
import { SPECS } from "./scenarios";

export interface Fixture {
  key: string;
  /** What the indexer stored. May contain drift (stale cache / reorg) the verifier will catch. */
  indexer: Dataset;
  /** Canonical chain state. */
  truth: Dataset;
  info: GroundTruth;
  drift: { kind: string; description: string } | null;
  /** Real contracts on Elysium testnet (planted by scripts/plant-testnet.ts). */
  onchain?: boolean;
  /** Verifier for this launch; defaults to the world replica. */
  verifier?: ChainSource;
  /** Live re-verification against the testnet RPC (slow, rate-limited). */
  liveVerifier?: ChainSource;
}

export interface FixtureWorld {
  fixtures: Fixture[];
  chainB: FixtureChain;
}

let world: FixtureWorld | null = null;

const clone = <T,>(x: T): T => structuredClone(x);

/**
 * Inject realistic indexer drift into some mock launches so the verifier has something to catch.
 * This is a demonstration of evidence-first publishing: the affected findings are withheld, openly.
 */
function applyDrift(key: string, truth: Dataset): { indexer: Dataset; drift: Fixture["drift"] } {
  const indexer = clone(truth);
  if (key === "mirage" || key === "wavecrest") {
    const L = buildLedger(truth);
    const fresh = L.holders.map((h) => h.address).filter((a) => (truth.nonces[a] ?? 0) <= 3).sort();
    const picked = sample(fresh, 16).slice(0, 3);
    for (const a of picked) {
      const n = truth.nonces[a] ?? 1;
      indexer.nonces[a] = n >= 3 ? n - 1 : n + 1;
    }
    return { indexer, drift: { kind: "stale-nonce-cache", description: `Indexer cached outdated transaction counts for ${picked.length} wallets (still classed fresh, but the receipts no longer match chain state).` } };
  }
  if (key === "holdfast") {
    const L = buildLedger(truth);
    const biggest = [...L.swaps].sort((a, b) => b.usd - a.usd || a.txHash.localeCompare(b.txHash)).slice(0, 2);
    for (const s of biggest) {
      const l = indexer.logs.find((x: RawLog) => x.txHash === s.txHash && x.logIndex === s.logIndex)!;
      // Off-by-one in the stored amount: the kind of mismatch a reorg or decode bug causes.
      l.data = (`0x${(BigInt(l.data) + 1n).toString(16).padStart(l.data.length - 2, "0")}`) as Hex;
    }
    return { indexer, drift: { kind: "log-decode-drift", description: "Indexer stored slightly different amounts for the two largest swaps than the chain returns." } };
  }
  return { indexer, drift: null };
}

export function getWorld(): FixtureWorld {
  if (world) return world;
  const fixtures: Fixture[] = [];
  const nonceTruth: Record<string, number> = {};
  for (const spec of SPECS) {
    const { truth, truthInfo, trueNonces } = generate(spec);
    Object.assign(nonceTruth, trueNonces);
    const { indexer, drift } = applyDrift(spec.key, truth);
    fixtures.push({ key: spec.key, truth, indexer, info: truthInfo, drift });
  }
  const dir = path.join(process.cwd(), "data", "testnet");
  if (existsSync(dir)) {
    const url = process.env.ELYSIUM_VERIFIER_RPC_URL || process.env.ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz";
    const independent = !!process.env.ELYSIUM_VERIFIER_RPC_URL;
    const label = `Elysium testnet RPC${independent ? " (independent provider)" : " (same provider as indexer; independent RPC not configured)"}`;
    const liveVerifier = new RpcSource(99801, url, label, true);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.includes(".fetches.")).sort()) {
      const j = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      const fp = path.join(dir, `${j.dataset.token.symbol}.fetches.json`);
      const verifier = existsSync(fp) ? new CachedSource(JSON.parse(readFileSync(fp, "utf8")) as Fetches, label) : liveVerifier;
      fixtures.push({ key: j.dataset.token.symbol.toLowerCase(), truth: j.dataset, indexer: j.dataset, info: j.info, drift: null, onchain: true, verifier, liveVerifier });
    }
  }
  world = { fixtures, chainB: new FixtureChain(fixtures.map((f) => f.truth), nonceTruth) };
  return world;
}

export function findFixture(idOrSymbol: string): Fixture | undefined {
  const q = idOrSymbol.toLowerCase();
  return getWorld().fixtures.find((f) => lc(f.truth.token.address) === q || f.truth.token.symbol.toLowerCase() === q || f.key === q);
}

export const FIXTURE_RULES = RULE_VERSIONS;
export type { Address };
