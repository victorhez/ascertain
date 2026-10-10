import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/tokens", label: "Tokens" },
  { href: "/methodology", label: "Methodology" },
  { href: "/agents", label: "Agents" },
  { href: "/withheld", label: "Withheld" },
  { href: "/submission", label: "Judge guide" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line backdrop-blur-xl" style={{ background: "color-mix(in oklab, var(--bg) 72%, transparent)" }}>
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Ascertain home"><Logo /></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-[14px] text-muted transition-colors hover:text-fg">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="chip hidden lg:inline-flex"><span className="live-dot" />Elysium testnet · 99801</span>
          <ThemeToggle />
          <Link href="/tokens" className="btn btn-primary btn-sm md:hidden">Tokens</Link>
          <Link href="/#check" className="btn btn-primary btn-sm hidden md:inline-flex">Check a token</Link>
        </div>
      </div>
    </header>
  );
}
