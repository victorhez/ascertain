import { describe, expect, it } from "vitest";
import { badgeSvg } from "@/lib/badge";

describe("badge", () => {
  const base = { symbol: "MIRA", verdict: "NO-GO" as const, verifiedAt: "2026-10-09T00:00:00Z", staleAfterMs: 6 * 3600_000 };
  it("shows the verdict when fresh", () => expect(badgeSvg({ ...base, now: Date.parse(base.verifiedAt) + 60_000 })).toContain("NO-GO"));
  it("turns stale-gray when data is older than the limit", () => {
    const svg = badgeSvg({ ...base, now: Date.parse(base.verifiedAt) + 7 * 3600_000 });
    expect(svg).toContain("STALE");
    expect(svg).toContain("#6b7280");
  });
});
