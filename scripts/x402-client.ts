// Pays for one Ascertain readiness call over x402.
//   ASCERTAIN_URL=http://localhost:3000 X402_PRIVATE_KEY=0x... npm run x402:demo -- MIRA
// Without X402_PRIVATE_KEY a throwaway key is generated (works against demo-mode servers only).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signPayment } from "../src/x402";

const base = (process.env.ASCERTAIN_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.argv[2] ?? "MIRA";
const account = privateKeyToAccount((process.env.X402_PRIVATE_KEY as `0x${string}`) ?? generatePrivateKey());
const url = `${base}/v1/token/${token}/readiness?tier=paid`;

const first = await fetch(url);
console.log("1. no payment ->", first.status);
const { accepts } = await first.json();
const header = await signPayment(account, accepts[0]);
console.log(`2. signed ${Number(accepts[0].maxAmountRequired) / 1e6} USDC authorization from ${account.address}`);
const second = await fetch(url, { headers: { "x-payment": header } });
console.log("3. with X-PAYMENT ->", second.status);
const body = await second.json();
console.log({ verdict: body.verdict, score: body.score, digest: body.inputsDigest });
const r = second.headers.get("x-payment-response");
if (r) console.log("receipt:", JSON.parse(Buffer.from(r, "base64").toString()));
