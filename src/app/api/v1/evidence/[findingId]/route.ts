import { json, preflight, problem, rateLimit } from "@/lib/api";
import { DISCLAIMER, findFindingById } from "@/lib/service";

export const OPTIONS = preflight;

export async function GET(req: Request, ctx: { params: Promise<{ findingId: string }> }) {
  const rl = rateLimit(req, 120);
  if (!rl.ok) return problem(429, "rate_limited");
  const { findingId } = await ctx.params;
  const hit = await findFindingById(findingId);
  if (!hit) return problem(404, "finding_not_found", "Finding ids are content hashes; they change when the underlying data or rule version changes.", { findingId });
  const { finding, analysis, fixture } = hit;
  return json(
    {
      finding: { ...finding, receipts: undefined },
      token: { address: analysis.token.address, symbol: analysis.token.symbol, chainId: analysis.token.chainId },
      receipts: finding.receipts ?? [],
      reproduceAll: (finding.receipts ?? []).map((r) => r.reproduce).filter((c) => c.startsWith("cast")),
      simulated: !!fixture,
      note: fixture
        ? "Simulated launch. The cast commands are the exact queries that re-fetch these facts once the planted contracts in /contracts are deployed to Elysium testnet; the built-in verifier replays the same queries against an independent replica."
        : undefined,
      disclaimer: DISCLAIMER,
    },
    { headers: rl.headers },
  );
}
