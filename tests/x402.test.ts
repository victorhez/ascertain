import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { requirementsFor, signPayment, verifyPayment, x402Config } from "@/x402";

const cfg = { ...x402Config(), mode: "demo" as const };
const reqs = requirementsFor("http://x/v1/token/MIRA/readiness", "t", 0.01, cfg);

describe("x402 (demo mode)", () => {
  it("accepts a valid signed authorization once", async () => {
    const h = await signPayment(privateKeyToAccount(generatePrivateKey()), reqs);
    const ok = await verifyPayment(h, reqs, cfg);
    expect(ok.ok).toBe(true);
  });
  it("rejects underpayment and tampering", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const cheap = await signPayment(acct, { ...reqs, maxAmountRequired: "1" });
    expect((await verifyPayment(cheap, reqs, cfg)).reason).toBe("insufficient_amount");
    const p = JSON.parse(Buffer.from(await signPayment(acct, reqs), "base64").toString());
    p.payload.authorization.from = privateKeyToAccount(generatePrivateKey()).address;
    expect((await verifyPayment(Buffer.from(JSON.stringify(p)).toString("base64"), reqs, cfg)).reason).toBe("invalid_signature");
  });
  it("prices $0.01 as 10000 USDC base units", () => expect(reqs.maxAmountRequired).toBe("10000"));
});
