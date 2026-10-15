import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem("ascertain-theme", "dark"); } catch {} });
await page.goto("https://ascertain.vercel.app/token/MIRT", { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));
const ok = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.includes("Published findings"));
  if (!h) return "no heading";
  const ul = h.closest("section").querySelector("ul");
  const li = [...ul.querySelectorAll("li")].find((l) => l.textContent.includes("Funding-source clusters")) || ul.querySelector("li");
  li.querySelector("details").open = true;
  const y = h.getBoundingClientRect().top + window.scrollY - 110; window.scrollTo({ top: y, behavior: "instant" });

  return "ok";
});
console.log(ok);
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "assets/mirt-evidence.png" });
await browser.close();
