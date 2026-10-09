import { json, originOf, paywall, preflight, problem, rateLimit } from "@/lib/api";
import { getAnalysis, integrityPayload } from "@/lib/service";

export const OPTIONS = preflight;
export const maxDuration = 30;

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const rl = rateLimit(req);
  if (!rl.ok) return problem(429, "rate_limited");
  const { address } = await ctx.params;
  const pay = await paywall(req, { priceUsd: 0.05, description: "Ascertain deep integrity report: concentration, funding clusters, wash loops, effective holders", freeTier: 0 });
  if (pay.response) return pay.response;
  const r = await getAnalysis(address);
  if (!r) return problem(404, "token_not_indexed", undefined, { address });
  const settled = await pay.settle();
  return json(integrityPayload(r.analysis, originOf(req)), { headers: { ...rl.headers, ...settled } });
}
