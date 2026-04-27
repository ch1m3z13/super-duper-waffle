// Alchemy Notify webhook handler.
//
// Setup in Alchemy dashboard:
//   1. Go to Notify → Create Webhook → Address Activity
//   2. Set webhook URL to: https://your-snap.vercel.app/api/webhook/alchemy
//   3. Add your PAYMENT_WALLET_ADDRESS as the monitored address
//   4. Copy the Signing Key → set as ALCHEMY_WEBHOOK_SIGNING_KEY in your env
//
// The webhook fires on every inbound transfer to your wallet.
// We verify the signature, check it's a USDC payment of ≥1, resolve the
// sender to a Farcaster FID via Neynar, and reset their usage count.

import { createHmac, timingSafeEqual } from "crypto";
import type { Context } from "hono";
import type { store as StoreType } from "./store.js";
import { getFidForAddress } from "./neynar.js";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
const MINIMUM_USDC = 1.0;

// ---------------------------------------------------------------------------
// Signature verification
// Alchemy signs the raw request body with HMAC-SHA256 using the signing key
// from the dashboard. Header: x-alchemy-signature
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signature: string): boolean {
  const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.warn("ALCHEMY_WEBHOOK_SIGNING_KEY not set — skipping signature check");
    return process.env.NODE_ENV !== "production";
  }

  try {
    const hmac = createHmac("sha256", signingKey);
    hmac.update(rawBody, "utf8");
    const digest = hmac.digest("hex");

    // Constant-time comparison to prevent timing attacks
    const digestBuf = Buffer.from(digest, "hex");
    const sigBuf = Buffer.from(signature, "hex");
    if (digestBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(digestBuf, sigBuf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alchemy Address Activity webhook payload shape (v2)
// ---------------------------------------------------------------------------

interface AlchemyActivity {
  fromAddress: string;
  toAddress: string;
  value: number;
  asset: string;
  category: string;
  rawContract?: { address?: string };
}

interface AlchemyWebhookPayload {
  type: string;
  event?: {
    network?: string;
    activity?: AlchemyActivity[];
  };
}

// ---------------------------------------------------------------------------
// Handler factory — takes the shared store as a parameter
// ---------------------------------------------------------------------------

export function createWebhookHandler(store: typeof StoreType) {
  return async (c: Context) => {
    // Read raw body first — must happen before any .json() call
    const rawBody = await c.req.text();
    const signature = c.req.header("x-alchemy-signature") ?? "";

    if (!verifySignature(rawBody, signature)) {
      console.warn("Webhook signature verification failed");
      return c.json({ error: "Unauthorized" }, 401);
    }

    let payload: AlchemyWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (payload.type !== "ADDRESS_ACTIVITY") {
      // Not an address activity event — acknowledge and ignore
      return c.json({ ok: true });
    }

    const activity = payload.event?.activity ?? [];
    const ourWallet = process.env.PAYMENT_WALLET_ADDRESS?.toLowerCase();

    if (!ourWallet) {
      console.error("PAYMENT_WALLET_ADDRESS is not set");
      return c.json({ error: "Server misconfiguration" }, 500);
    }

    for (const transfer of activity) {
      // Must be a token transfer to our wallet
      if (transfer.category !== "token") continue;
      if (transfer.toAddress?.toLowerCase() !== ourWallet) continue;

      // Must be USDC (check both asset name and contract address)
      const isUsdc =
        transfer.asset === "USDC" ||
        transfer.rawContract?.address?.toLowerCase() === USDC_ADDRESS;
      if (!isUsdc) continue;

      // Must be ≥ 1 USDC
      if ((transfer.value ?? 0) < MINIMUM_USDC) continue;

      const fromAddress = transfer.fromAddress;
      if (!fromAddress) continue;

      // Resolve sender address → Farcaster FID
      let fid: number | null;
      try {
        fid = await getFidForAddress(fromAddress);
      } catch (err) {
        console.error(`Neynar lookup failed for ${fromAddress}:`, err);
        continue;
      }

      if (!fid) {
        console.log(
          `Payment of ${transfer.value} USDC received from ${fromAddress} — no Farcaster FID found, skipping`
        );
        continue;
      }

      // Reset usage count → user is now unlocked
      const usageKey = `usage:${fid}`;
      await store.set(usageKey, 0);

      // Also set a permanent "paid" flag so they never hit the gate again
      // even after using more than FREE_LIMIT lookups in the future.
      await store.set(`paid:${fid}`, true);

      console.log(
        `✅ Unlocked FID ${fid} (${fromAddress}) — ${transfer.value} USDC received`
      );
    }

    return c.json({ ok: true });
  };
}
