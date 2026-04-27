import { Hono } from "hono";
import { registerSnapHandler } from "@farcaster/snap-hono";
import { store } from "./store.js";
import { explainTransaction } from "./explain.js";
import { getAddressesForFid } from "./neynar.js";
import { findPaymentFromAddresses } from "./payments.js";
import { createWebhookHandler } from "./webhook.js";
import {
  homePage,
  resultPage,
  errorPage,
  lockedPage,
  paymentPendingPage,
  stillWaitingPage,
  unlockedPage,
} from "./pages.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FREE_LIMIT = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBase(request: Request): string {
  const fromEnv = process.env.SNAP_PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host") ?? "localhost:3003")
    .split(",")[0]
    .trim();

  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/.test(host);
  const proto = isLoopback ? "http" : "https";
  return `${proto}://${host}`;
}

async function isPaidUser(fid: number): Promise<boolean> {
  return ((await store.get(`paid:${fid}`)) as boolean | null) === true;
}

async function getUsage(fid: number): Promise<number> {
  return ((await store.get(`usage:${fid}`)) as number | null) ?? 0;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono();

// ---------------------------------------------------------------------------
// Alchemy Notify webhook
// POST /api/webhook/alchemy
// Fires automatically on USDC transfers to your wallet.
// ---------------------------------------------------------------------------

app.post("/api/webhook/alchemy", createWebhookHandler(store));

// ---------------------------------------------------------------------------
// Snap handler
// ---------------------------------------------------------------------------

registerSnapHandler(
  app,
  async (ctx) => {
    const base = getBase(ctx.request);
    const url = new URL(ctx.request.url);
    const action = url.searchParams.get("action");

    // -----------------------------------------------------------------------
    // GET — render home page
    // -----------------------------------------------------------------------
    if (ctx.action.type === "get") {
      return homePage(base);
    }

    const fid = ctx.action.user.fid;

    // -----------------------------------------------------------------------
    // Action: explain — decode a transaction
    // -----------------------------------------------------------------------
    if (action === "explain") {
      const tx = (ctx.action.inputs?.tx as string | undefined)?.trim() ?? "";

      if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) {
        return errorPage(
          base,
          "That doesn't look like a valid tx hash. It should be 0x followed by 64 hex characters."
        );
      }

      const paid = await isPaidUser(fid);
      if (!paid) {
        const usage = await getUsage(fid);
        if (usage >= FREE_LIMIT) return lockedPage(base);
      }

      try {
        const result = await explainTransaction(tx);
        const paid2 = await isPaidUser(fid);

        if (paid2) {
          return resultPage(base, result, tx, Infinity);
        }

        const usage = await getUsage(fid);
        await store.set(`usage:${fid}`, usage + 1);
        return resultPage(base, result, tx, FREE_LIMIT - (usage + 1));
      } catch (err) {
        console.error("explainTransaction failed:", err);
        return errorPage(
          base,
          "Couldn't decode that transaction. It may not be on Base, or may still be pending — try again in a moment."
        );
      }
    }

    // -----------------------------------------------------------------------
    // Action: initiate-payment — user clicked "Unlock for 1 USDC"
    // Record intent and return the two-step payment page.
    // -----------------------------------------------------------------------
    if (action === "initiate-payment") {
      await store.set(`payment-intent:${fid}`, Date.now());
      return paymentPendingPage(base);
    }

    // -----------------------------------------------------------------------
    // Action: check-payment — user clicked "I already paid — check"
    // -----------------------------------------------------------------------
    if (action === "check-payment") {
      // Webhook may have already unlocked them
      if (await isPaidUser(fid)) {
        return unlockedPage(base);
      }

      let addresses: string[];
      try {
        addresses = await getAddressesForFid(fid);
      } catch (err) {
        console.error("Neynar lookup failed:", err);
        return errorPage(
          base,
          "Couldn't look up your wallet addresses right now. Please try again in a moment."
        );
      }

      if (addresses.length === 0) {
        return errorPage(
          base,
          "No wallet addresses found for your Farcaster account. Connect a wallet at warpcast.com/~/settings to enable payment verification."
        );
      }

      let paymentResult: { found: boolean; txHash?: string };
      try {
        paymentResult = await findPaymentFromAddresses(addresses);
      } catch (err) {
        console.error("findPaymentFromAddresses failed:", err);
        return errorPage(
          base,
          "Couldn't check payment status right now. Please try again in a moment."
        );
      }

      if (paymentResult.found) {
        await store.set(`usage:${fid}`, 0);
        await store.set(`paid:${fid}`, true);
        console.log(`Unlocked FID ${fid} via check-payment (tx: ${paymentResult.txHash})`);
        return unlockedPage(base);
      }

      return stillWaitingPage(base);
    }

    // Default
    return homePage(base);
  },
  {
    skipJFSVerification: process.env.SKIP_JFS_VERIFICATION === "1",
  }
);

export default app;
