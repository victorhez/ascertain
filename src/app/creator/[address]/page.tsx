import type { Metadata } from "next";
import Link from "next/link";
import { Lifecycle } from "@/components/Lifecycle";
import { Planner } from "@/components/Planner";
import { RuleTable } from "@/components/RuleTable";
import { Icon, ScoreRing, SectionHead, VerdictPill } from "@/components/ui";
import { defaultConfig } from "@/engine/config";
import { getAnalysis } from "@/lib/service";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Creator dashboard" };
export const dynamic = "force-dynamic";

export default async function Creator({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const r = await getAnalysis(decodeURIComponent(address));
  if (!r) notFound();
  const a = r.analysis;
  const v = a.verdicts.creator;
  const vol = a.findings.find((f) => f.signal === "volume_per_wallet" && f.status === "published")?.value;
  const gaps = v.breakdown.filter((x) => x.status !== "pass");
  const passed = v.breakdown.length - gaps.length;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-10 sm:px-6">
      <Link href={`/token/${a.token.symbol}`} className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg"><span className="rotate-180"><Icon name="arrow" size={14} /></span>{a.token.symbol} verdict</Link>
      <div className="eyebrow mb-3 mt-5">Creator dashboard</div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]"><span className="mono">{a.token.symbol}</span> <span className="text-muted">readiness</span></h1>
        <VerdictPill verdict={v.verdict} size="lg" />
      </div>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">How close is this token to Ascended status, and what is holding it back? Everything below is an estimate from public Ascend criteria.</p>

      <section className="mt-10 grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="card flex items-center justify-center p-8"><ScoreRing score={v.score} verdict={v.verdict} partial={v.scoreIsPartial} size={170} /></div>
        <div className="card p-6">
          <div className="eyebrow mb-3">{passed} of {v.breakdown.length} rules pass</div>
          {gaps.length === 0 ? (
            <p className="text-[15px] leading-relaxed">Every rule passes on verified evidence. Next step: apply for Ascended status through Ascend and keep the evidence fresh.</p>
          ) : (
            <ul className="space-y-3">
              {gaps.map((g) => (
                <li key={g.id} className="flex gap-3 text-[14px] leading-relaxed">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: g.status === "hard-fail" ? "var(--nogo)" : g.status === "unverified" ? "var(--dim)" : "var(--wait)" }} />
                  <span><b className="font-medium">{g.label}.</b> <span className="text-muted">{g.flip ?? "Evidence for this rule is withheld, so it cannot be assessed yet."}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Lifecycle" title="Where this token sits.">Launch is measurable today. Later stages are shown with what is documented and what Ascend has not disclosed.</SectionHead>
        <Lifecycle activeIndex={0} />
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Gap to Ascended" title="Every rule against the estimated bar." />
        <div className="card-solid p-2 sm:p-4"><RuleTable rules={v.breakdown} /></div>
      </section>

      <section className="mt-16 scroll-mt-24" id="planner">
        <SectionHead eyebrow="Revenue and listing reserve" title="Model what this could earn, and what to set aside.">Uses the fee splits Ascend has published. Every figure is an assumption you control.</SectionHead>
        <Planner defaultDailyVolume={vol?.weightedOrganicDailyUsd ?? 10000} fee={defaultConfig.listing.tokenTradingFee} deployerShare={defaultConfig.listing.deployerFeeShare} approvedShare={defaultConfig.listing.approvedFeeShare} referralShare={defaultConfig.listing.referralShare} />
      </section>
    </div>
  );
}
