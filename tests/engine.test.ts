import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { defaultConfig } from "@/engine/config";
import { applyAdvisory } from "@/engine/readiness";
import { verifyFindings } from "@/engine/verifier";
import { computeFindings } from "@/engine/analyze";
import { getWorld } from "@/fixtures";
import { runBacktest } from "@/fixtures/backtest";

const NOW = new Date("2026-10-09T00:00:00Z");
const world = getWorld();
const fx = (key: string) => world.fixtures.find((f) => f.key === key)!;
const run = (key: string, verifier = true) => analyze(fx(key).indexer, { verifier: verifier ? world.chainB : null, now: NOW });

describe("verdicts on planted launches", () => {
  it.each([
    ["lumen", "GO"],
    ["risefall", "WAIT"],
    ["holdfast", "NO-GO"],
    ["wavecrest", "NO-GO"],
    ["mirage", "NO-GO"],
  ])("%s -> %s", async (key, verdict) => {
    expect((await run(key)).verdicts.creator.verdict).toBe(verdict);
  });
});

describe("signals find the planted pattern and leave the clean token alone", () => {
  it("clustered token: 412 raw holders collapse to 38 effective, 4/4 clusters", async () => {
    const a = await run("mirage");
    const eff = a.findings.find((f) => f.signal === "effective_holders")!.value;
    expect(eff.raw).toBe(412);
    expect(eff.effective).toBe(38);
    const cl = a.findings.find((f) => f.signal === "funding_clusters")!.value;
    expect(cl.clusters.map((c: any) => c.size)).toEqual([200, 110, 48, 20]);
  });

  it("wash-traded token: all 12 planted wash wallets found", async () => {
    const a = await run("wavecrest");
    const w = a.findings.find((f) => f.signal === "wash_loops")!.value;
    const planted = new Set<string>(fx("wavecrest").info.plantedWashWallets);
    expect(w.washWallets.filter((x: string) => planted.has(x)).length).toBe(12);
    expect(w.washShare).toBeGreaterThan(0.5);
  });

  it("clean token: no wash wallets, no cluster beyond the planted family group", async () => {
    const a = await run("lumen");
    expect(a.findings.find((f) => f.signal === "wash_loops")!.value.washWalletCount).toBe(0);
    expect(a.findings.find((f) => f.signal === "funding_clusters")!.value.clusterCount).toBe(1);
    expect(a.findings.find((f) => f.signal === "same_block_entry")!.value.bundleCount).toBe(0);
  });

  it("concentrated token trips the hard concentration rules", async () => {
    const v = (await run("holdfast")).verdicts.creator;
    expect(v.breakdown.filter((r) => r.status === "hard-fail").map((r) => r.id).sort()).toEqual(["top10_share", "top1_share"]);
  });
});

describe("evidence-first publishing", () => {
  it("publishes nothing when the verifier is removed", async () => {
    const a = await run("lumen", false);
    expect(a.published).toHaveLength(0);
    expect(a.withheld.length).toBeGreaterThan(0);
    expect(a.verdicts.creator.verdict).toBe("WAIT");
  });

  it("withholds findings whose cited facts do not re-fetch identically, and says why", async () => {
    const a = await run("mirage");
    const f = a.withheld.find((x) => x.signal === "wallet_age");
    expect(f).toBeTruthy();
    expect(f!.withheldReason).toMatch(/did not re-fetch identically/);
    // The verdict still stands on the findings that did verify.
    expect(a.verdicts.creator.verdict).toBe("NO-GO");
  });

  it("a tampered receipt fails verification", async () => {
    const { findings } = computeFindings(fx("lumen").indexer);
    const tampered = structuredClone(findings);
    tampered[0].evidence[1].raw = tampered[0].evidence[1].raw.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    const out = await verifyFindings(tampered, world.chainB, {}, NOW);
    expect(out[0].status).toBe("withheld");
    expect(out.slice(1).every((f) => f.status === "published")).toBe(true);
  });

  it("is reproducible: same data and rules give the same digest", async () => {
    const a = await run("holdfast");
    const b = await run("holdfast");
    expect(a.verdicts.creator.inputsDigest).toBe(b.verdicts.creator.inputsDigest);
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
  });

  it("every published finding carries verified receipts (simulated launches show no cast command)", async () => {
    const a = await run("lumen");
    for (const f of a.published) {
      expect(f.receipts!.length).toBeGreaterThan(0);
      expect(f.receipts!.every((r) => r.verified && r.reproduce.startsWith("cast "))).toBe(true);
    }
  });
});

describe("AI advisory can downgrade but never upgrade", () => {
  it("downgrades GO to WAIT / NO-GO", () => {
    expect(applyAdvisory("GO", "WAIT")).toEqual({ verdict: "WAIT", downgraded: true });
    expect(applyAdvisory("GO", "NO-GO")).toEqual({ verdict: "NO-GO", downgraded: true });
  });
  it("can never unlock a Go", () => {
    expect(applyAdvisory("WAIT", "GO")).toEqual({ verdict: "WAIT", downgraded: false });
    expect(applyAdvisory("NO-GO", "GO")).toEqual({ verdict: "NO-GO", downgraded: false });
    expect(applyAdvisory("NO-GO", "WAIT")).toEqual({ verdict: "NO-GO", downgraded: false });
  });
});

describe("intents", () => {
  it("trader and staker verdicts use their own rule subsets", async () => {
    const a = await run("risefall");
    expect(a.verdicts.trader.verdict).toBe("WAIT"); // top-10 above soft limit
    expect(a.verdicts.staker.breakdown.map((r) => r.id)).toEqual(defaultConfig.intents.staker);
  });
});

describe("back-test summary", () => {
  it("meets the claims published in the README", async () => {
    const r = await runBacktest(NOW);
    expect(r.summary.verdictAccuracy).toBe("5/5");
    expect(r.summary.plantedClustersFound).toBe("7/7");
    expect(r.summary.plantedWashWalletsFound).toBe("12/12");
    expect(r.summary.falsePositiveClustersOnCleanTokens).toBe(0);
    expect(r.summary.falsePositiveWashWalletsOnCleanTokens).toBe(0);
  });
});
