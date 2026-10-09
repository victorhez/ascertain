import Link from "next/link";
import { Mark } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[640px] flex-col items-start justify-center px-4 py-20 sm:px-6">
      <Mark size={44} className="text-muted" />
      <div className="eyebrow mb-3 mt-8">404</div>
      <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.03em]">Nothing to ascertain here.</h1>
      <p className="mt-3 text-[16px] text-muted">That page or token does not exist. Ascertain only publishes verdicts for tokens it has indexed.</p>
      <div className="mt-8 flex gap-3"><Link href="/" className="btn btn-primary">Home</Link><Link href="/tokens" className="btn">Browse tokens</Link></div>
    </div>
  );
}
