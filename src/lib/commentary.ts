import type { Analysis } from "@/engine/analyze";
import { applyAdvisory } from "@/engine/readiness";
import type { Intent, Verdict } from "@/engine/types";

export interface Commentary {
  text: string;
  source: "rules" | "ai";
  advisory: Verdict | "NONE";
  verdict: Verdict;
  downgraded: boolean;
  note: string;
}

const NOTE = "Commentary is advisory. It can downgrade a verdict to WAIT or NO-GO but can never upgrade one; verdicts come from deterministic, versioned rules.";

function ruleText(a: Analysis, intent: Intent): string {
  const v = a.verdicts[intent];
  const sym = a.token.symbol;
  const eff = a.findings.find((f) => f.signal === "effective_holders" && f.status === "published")?.value;
  const lead =
    v.verdict === "GO"
      ? `${sym} clears every rule for the ${intent} view on verified evidence.`
      : v.verdict === "WAIT"
        ? `${sym} is not blocked by a hard rule, but it is not there yet.`
        : `${sym} fails at least one hard integrity rule.`;
  const holders = eff ? ` ${eff.raw} raw holders resolve to ${eff.effective} effective holders.` : "";
  const why = v.reasons.slice(0, 2).join(" ");
  return `${lead}${holders} ${why}`.trim();
}

export async function commentary(a: Analysis, intent: Intent): Promise<Commentary> {
  const v = a.verdicts[intent];
  const base: Commentary = { text: ruleText(a, intent), source: "rules", advisory: "NONE", verdict: v.verdict, downgraded: false, note: NOTE };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return base;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 400,
        system:
          "You explain on-chain token integrity results in plain language. Describe observable patterns only; never accuse a named person of wrongdoing. Reply with strict JSON: {\"commentary\": string (max 3 sentences), \"advisory\": \"WAIT\"|\"NO-GO\"|\"NONE\"}. Use advisory only if the data shows a risk the rule verdict under-weights.",
        messages: [{ role: "user", content: JSON.stringify({ intent, verdict: v.verdict, score: v.score, reasons: v.reasons, failed: v.failed.map((r) => ({ id: r.id, value: r.value, threshold: r.threshold })), signals: a.published.map((f) => ({ signal: f.signal, summary: f.summary })) }) }],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return base;
    const j = (await res.json()) as { content?: { text?: string }[] };
    const raw = j.content?.[0]?.text ?? "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { commentary?: string; advisory?: string };
    const advisory = (["WAIT", "NO-GO"].includes(parsed.advisory ?? "") ? parsed.advisory : "NONE") as Verdict | "NONE";
    const { verdict, downgraded } = applyAdvisory(v.verdict, advisory);
    return { text: parsed.commentary?.slice(0, 600) || base.text, source: "ai", advisory, verdict, downgraded, note: NOTE };
  } catch {
    return base;
  }
}
