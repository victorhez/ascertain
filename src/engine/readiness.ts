import { digestOf } from "./canonical";
import { RULE_VERSIONS, type EngineConfig } from "./config";
import type { Address, Finding, Intent, RuleResult, SignalId, Verdict, VerdictResult } from "./types";

interface Metric { signal: SignalId; get: (v: Record<string, any>) => number | undefined }

const METRICS: Record<string, Metric> = {
  market_cap_usd: { signal: "market_cap", get: (v) => v.marketCapUsd },
  effective_holders: { signal: "effective_holders", get: (v) => v.effective },
  organic_volume_usd: { signal: "volume_per_wallet", get: (v) => v.weightedOrganicDailyUsd },
  effective_ratio: { signal: "effective_holders", get: (v) => v.ratio },
  top10_share: { signal: "concentration", get: (v) => v.top10 },
  top1_share: { signal: "concentration", get: (v) => v.top1 },
  inflated_volume_share: { signal: "volume_per_wallet", get: (v) => v.inflatedShare },
  fresh_wallet_share: { signal: "wallet_age", get: (v) => v.freshShare },
};

const fmt = (id: string, x: number, unit: string) =>
  unit === "usd" ? `$${Math.round(x).toLocaleString("en-US")}` : unit === "pct" ? `${(x * 100).toFixed(1)}%` : unit === "ratio" ? x.toFixed(2) : Math.round(x).toLocaleString("en-US");

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const ORDER: Record<Verdict, number> = { GO: 0, WAIT: 1, "NO-GO": 2 };

/** Pure, deterministic. Same published findings + same config = same verdict. */
export function computeVerdict(
  token: Address,
  intent: Intent,
  published: Finding[],
  cfg: EngineConfig,
  now = new Date(),
): VerdictResult {
  const bySignal = new Map<SignalId, Finding>();
  for (const f of published) if (f.status === "published") bySignal.set(f.signal, f);

  const ids = cfg.intents[intent];
  const results: RuleResult[] = [];
  for (const id of ids) {
    const rc = cfg.rules[id];
    const m = METRICS[id];
    const finding = bySignal.get(m.signal);
    const value = finding ? m.get(finding.value) ?? null : null;
    const isMin = rc.min !== undefined;
    const threshold = (isMin ? rc.min : rc.max)!;
    const hardT = isMin ? rc.hardMin : rc.hardMax;
    const res: RuleResult = {
      id, label: rc.label, kind: rc.kind, value, threshold, hardThreshold: hardT,
      op: isMin ? ">=" : "<=", unit: rc.unit, status: "unverified", weight: rc.weight, subScore: 0, signal: m.signal,
    };
    if (value === null) { results.push(res); continue; }

    const pass = isMin ? value >= threshold : value <= threshold;
    const hardFail = rc.hard !== false && hardT !== undefined && (isMin ? value < hardT : value > hardT);
    res.status = pass ? "pass" : hardFail ? "hard-fail" : "fail";

    if (rc.kind === "growth") res.subScore = clamp01(value / threshold);
    else if (isMin) res.subScore = pass ? 1 : clamp01((value - (hardT ?? 0)) / (threshold - (hardT ?? 0)));
    else res.subScore = pass ? 1 : clamp01(((hardT ?? threshold * 2) - value) / ((hardT ?? threshold * 2) - threshold));

    if (!pass) {
      if (rc.kind === "growth") res.flip = `Needs +${fmt(id, threshold - value, rc.unit)} (now ${fmt(id, value, rc.unit)}, estimated bar ${fmt(id, threshold, rc.unit)}).`;
      else if (id === "effective_ratio") res.flip = `Only ${fmt(id, value, rc.unit)} of raw holders are independent. Adding more linked wallets cannot fix this; only genuinely distinct holders can. Bar: ${fmt(id, threshold, rc.unit)}.`;
      else res.flip = `Reduce by ${rc.unit === "pct" ? ((value - threshold) * 100).toFixed(1) + " pts" : fmt(id, value - threshold, rc.unit)} (now ${fmt(id, value, rc.unit)}, estimated limit ${fmt(id, threshold, rc.unit)}).`;
      if (hardFail) res.flip = `Hard rule. ${res.flip}`;
    }
    results.push(res);
  }

  const verified = results.filter((r) => r.status !== "unverified");
  const wSum = verified.reduce((a, r) => a + r.weight, 0);
  const score = wSum ? Math.round((100 * verified.reduce((a, r) => a + r.weight * r.subScore, 0)) / wSum) : 0;
  const hard = results.filter((r) => r.status === "hard-fail");
  const failed = results.filter((r) => r.status === "fail" || r.status === "hard-fail");
  const unverified = results.filter((r) => r.status === "unverified");

  let verdict: Verdict;
  const reasons: string[] = [];
  if (!verified.length) {
    verdict = "WAIT";
    reasons.push("No finding passed verification, so nothing can be asserted. Evidence-first: a verdict needs published evidence.");
  } else if (hard.length) {
    verdict = "NO-GO";
    for (const r of hard) reasons.push(`Hard rule failed: ${r.label} is ${fmt(r.id, r.value!, r.unit)} (${r.op} ${fmt(r.id, r.threshold, r.unit)} required; hard limit ${fmt(r.id, r.hardThreshold!, r.unit)}).`);
  } else if (failed.length || unverified.length) {
    verdict = "WAIT";
    for (const r of failed) reasons.push(`${r.label} is ${fmt(r.id, r.value!, r.unit)}; estimated bar is ${r.op} ${fmt(r.id, r.threshold, r.unit)}.`);
    if (unverified.length) reasons.push(`${unverified.length} rule${unverified.length > 1 ? "s" : ""} could not be verified (${unverified.map((r) => r.label).join(", ")}); a GO needs every rule backed by verified evidence.`);
  } else {
    verdict = "GO";
    reasons.push(`All ${results.length} rules pass on verified evidence against the estimated thresholds.`);
  }

  const ruleVersions: Record<string, string> = {};
  for (const f of published) if (f.status === "published") ruleVersions[f.signal] = f.ruleVersion;
  for (const k of Object.keys(RULE_VERSIONS)) ruleVersions[k] ??= (RULE_VERSIONS as Record<string, string>)[k];

  return {
    token, intent, verdict, score, scoreIsPartial: unverified.length > 0,
    breakdown: results, failed,
    flip: failed.map((r) => r.flip!).filter(Boolean),
    reasons, configVersion: cfg.version, ruleVersions,
    inputsDigest: digestOf({ intent, cfg: cfg.version, findings: published.filter((f) => f.status === "published").map((f) => [f.id, f.value]).sort() }),
    computedAt: now.toISOString(),
  };
}

/**
 * Hard rule: advisory (AI) commentary may downgrade a verdict to WAIT or NO-GO.
 * It can never upgrade one. The more severe of the two always wins.
 */
export function applyAdvisory(rule: Verdict, advisory?: Verdict | "NONE" | null): { verdict: Verdict; downgraded: boolean } {
  if (!advisory || advisory === "NONE") return { verdict: rule, downgraded: false };
  const verdict = ORDER[advisory] > ORDER[rule] ? advisory : rule;
  return { verdict, downgraded: verdict !== rule };
}
