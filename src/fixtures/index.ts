import { lc } from "@/chain/codec";
import { RULE_VERSIONS } from "@/engine/config";
import { buildLedger } from "@/engine/ledger";
import { sample } from "@/engine/evidence";
import type { Address, Dataset, Hex, RawLog } from "@/engine/types";
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
  world = { fixtures, chainB: new FixtureChain(fixtures.map((f) => f.truth), nonceTruth) };
  return world;
}

export function findFixture(idOrSymbol: string): Fixture | undefined {
  const q = idOrSymbol.toLowerCase();
  return getWorld().fixtures.find((f) => lc(f.truth.token.address) === q || f.truth.token.symbol.toLowerCase() === q || f.key === q);
}

export const FIXTURE_RULES = RULE_VERSIONS;
export type { Address };
