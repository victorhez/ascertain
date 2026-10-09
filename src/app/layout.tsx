import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const site =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Ascertain: know who is really holding", template: "%s · Ascertain" },
  description:
    "Integrity and readiness verification for Ascend launches on Elysium. Separates real holders from coordinated activity and returns a Go / Wait / No-go verdict with evidence anyone can re-fetch.",
  applicationName: "Ascertain",
  openGraph: { title: "Ascertain", description: "Evidence-first verdicts for Ascend launches on Elysium.", type: "website", siteName: "Ascertain" },
  twitter: { card: "summary_large_image", title: "Ascertain", description: "Know who is really holding. Evidence-first verdicts for Ascend launches." },
  alternates: { types: { "application/json": "/.well-known/agent-card.json" } },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07080a" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
  ],
};

const themeScript = `try{var t=localStorage.getItem("ascertain-theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="atmosphere" aria-hidden />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
