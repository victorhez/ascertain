import { getAnalysis } from "../src/lib/service";
import { getWorld } from "../src/fixtures";
for (const f of getWorld().fixtures.filter((x) => x.onchain)) {
  const t0 = Date.now();
  const { analysis: a } = (await getAnalysis(f.truth.token.address))!;
  const v = a.verdicts.creator;
  console.log(`${a.token.symbol} expected ${f.info.expectedVerdict} got ${v.verdict} score ${v.score} (${Date.now() - t0}ms)`);
  console.log("  raw/eff", f.info.rawHolders, f.info.plantedEffectiveHolders, "found", a.findings.find((x) => x.signal === "effective_holders")?.value.raw, a.findings.find((x) => x.signal === "effective_holders")?.value.effective);
  for (const w of a.withheld) console.log("  withheld", w.signal, w.withheldReason?.slice(0, 220));
  for (const r of v.breakdown) console.log("   ", r.status.padEnd(10), r.id.padEnd(22), r.value, r.op, r.threshold);
}
