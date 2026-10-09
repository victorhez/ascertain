import { mkdirSync, writeFileSync } from "node:fs";
import { runBacktest } from "../src/fixtures/backtest";

const r = await runBacktest();
mkdirSync("evidence", { recursive: true });
const { evidence, ...rest } = r;
writeFileSync("evidence/backtest-summary.json", JSON.stringify(rest, null, 2));
writeFileSync("evidence/backtest-evidence.json", JSON.stringify(evidence, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1));

console.log("\nAscertain back-test (simulated launches with planted ground truth)\n");
console.table(
  r.rows.map((x) => ({
    token: x.symbol,
    scenario: x.scenario,
    expected: x.expectedVerdict,
    got: x.verdict,
    "raw→eff (found)": `${x.rawHolders.found}→${x.effectiveHolders.found}`,
    "raw→eff (planted)": `${x.rawHolders.planted}→${x.effectiveHolders.planted}`,
    "clusters ✓/planted": `${x.clusters.matched}/${x.clusters.planted}`,
    "cluster FP": x.clusters.falsePositive,
    "wash ✓/planted": `${x.washWallets.truePositive}/${x.washWallets.planted}`,
    "wash FP": x.washWallets.falsePositive,
    withheld: x.findingsWithheld,
  })),
);
console.log(r.summary);
console.log("\nwrote evidence/backtest-summary.json and evidence/backtest-evidence.json");
