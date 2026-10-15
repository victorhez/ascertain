import { describe, expect, it } from "vitest";
import { getWorld } from "@/fixtures";
import { getAnalysis } from "@/lib/service";

/** Recorded receipts must cover every fact the engine cites today. Catches a stale or partial fetches file. */
describe("recorded receipts for on-chain and real launches", () => {
  const targets = getWorld().fixtures.filter((f) => f.onchain || f.real);
  it.each(targets.map((f) => [f.truth.token.symbol, f.truth.token.address]))("%s publishes every finding", async (_s, addr) => {
    const a = (await getAnalysis(addr as string))!.analysis;
    expect(a.withheld.map((w) => `${w.signal}: ${w.withheldReason}`)).toEqual([]);
  });
});
