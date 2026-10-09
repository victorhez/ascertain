import { defaultConfig } from "@/engine/config";
import { badgeSvg } from "@/lib/badge";
import { getAnalysis } from "@/lib/service";

export const maxDuration = 30;

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const id = address.replace(/\.svg$/i, "");
  const url = new URL(req.url);
  const maxAge = Number(url.searchParams.get("maxAge"));
  const r = await getAnalysis(id);
  const headers = { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60", "access-control-allow-origin": "*" };
  if (!r) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="28"><rect width="170" height="28" rx="7" fill="#6b7280"/><text x="12" y="18" font-family="system-ui,sans-serif" font-size="11.5" font-weight="600" fill="#fff">ascertain · not indexed</text></svg>`;
    return new Response(svg, { status: 404, headers });
  }
  const a = r.analysis;
  return new Response(
    badgeSvg({
      symbol: a.token.symbol,
      verdict: a.verdicts.creator.verdict,
      verifiedAt: a.verifiedAt,
      staleAfterMs: Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : defaultConfig.stalenessLimitMs,
      simulated: !!r.fixture,
    }),
    { headers },
  );
}
