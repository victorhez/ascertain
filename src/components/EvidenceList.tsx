import type { Finding } from "@/engine/types";
import { CopyButton } from "./CopyButton";
import { Icon } from "./ui";
import { short } from "@/lib/format";

export function EvidenceList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="space-y-3">
      {findings.map((f) => {
        const pub = f.status === "published";
        return (
          <li key={f.id} className="card-solid overflow-hidden">
            <details>
              <summary className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <Icon name="chev" size={16} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{f.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] text-muted">{f.summary}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono hidden text-[11.5px] text-dim sm:inline">{f.ruleVersion}</span>
                  <span className={`pill ${pub ? "pill-go" : "pill-nogo"} !h-[22px] !text-[11px]`}>{pub ? "published" : "withheld"}</span>
                </div>
              </summary>
              <div className="border-t border-line px-5 py-5">
                {!pub && (
                  <div className="mb-5 rounded-xl border border-line p-4 text-[13px] leading-relaxed" style={{ background: "color-mix(in oklab, var(--nogo) 8%, transparent)" }}>
                    <b className="font-medium" style={{ color: "var(--nogo)" }}>Withheld.</b> {f.withheldReason}
                  </div>
                )}
                <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-muted">
                  <span>Finding <span className="mono text-fg">{f.id}</span></span>
                  <span>{f.evidence.length} cited facts</span>
                  <span>digest <span className="mono text-fg">{f.evidenceDigest.slice(0, 12)}…</span></span>
                  <a className="underline decoration-line2 underline-offset-4 hover:text-fg" href={`/v1/evidence/${f.id}`} target="_blank" rel="noreferrer">JSON</a>
                </div>
                {f.receipts && f.receipts.length > 0 ? (
                  <div className="scroll-x">
                    <table className="tbl min-w-[720px] text-[12.5px]">
                      <thead><tr><th>Fact</th><th>Block</th><th>Reference</th><th>Re-fetched</th><th /></tr></thead>
                      <tbody>
                        {f.receipts.slice(0, 24).map((r, i) => (
                          <tr key={i}>
                            <td className="mono">{r.kind}</td>
                            <td className="mono text-muted">{r.blockNumber.toLocaleString("en-US")}</td>
                            <td className="mono text-muted">{r.txHash ? short(r.txHash, 10, 8) : r.callData ? `${r.callData.slice(0, 10)}…(${short(r.address, 6, 4)})` : short(r.address, 8, 6)}</td>
                            <td>
                              {r.verified
                                ? <span className="inline-flex items-center gap-1.5" style={{ color: "var(--go)" }}><Icon name="check" size={14} />identical</span>
                                : <span className="inline-flex items-center gap-1.5" style={{ color: "var(--nogo)" }}><Icon name="x" size={14} />mismatch</span>}
                            </td>
                            <td className="text-right">{r.reproduce.startsWith("cast") ? <CopyButton text={r.reproduce} label="cast" /> : <span className="text-[11px] text-dim">simulated</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">No receipts: the verifier was not attached, so nothing was re-fetched and nothing is published.</p>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
