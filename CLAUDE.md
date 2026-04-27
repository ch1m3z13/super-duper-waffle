# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Hono-based server that acts as a [Farcaster Snap](https://farcaster.xyz/~/developers/snaps), letting users paste a Base transaction hash and get a plain-English explanation via Claude AI. Deployed on Vercel.

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Start dev server on http://localhost:3003
pnpm build         # Type-check with tsc
```

Test in the Snap Emulator at <https://farcaster.xyz/~/developers/snaps>, pointing it at `http://localhost:3003/`.

## Architecture

```
src/
  index.ts     — Hono app entry, snap handler registration, freemium gate logic
  pages.ts     — All SnapResponse UI shapes (home, result, error, locked, payment, etc.)
  explain.ts   — Transaction decoding via Alchemy RPC + explanation via Anthropic Claude
  neynar.ts    — FID → wallet addresses lookup
  payments.ts  — USDC payment detection via Alchemy
  webhook.ts   — Alchemy Notify webhook handler for automatic payment detection
  store.ts    — Single TursoDataStore instance (in-memory locally, Turso in prod)
```

**Request flow for `?action=explain`:**

1. Validate tx hash format
2. Check if FID is paid or under free limit (3 per FID)
3. `explainTransaction(tx)` → Alchemy (eth_getTransactionByHash + eth_getTransactionReceipt in parallel), then Claude with a structured prompt asking for `{summary, risk, riskReason}` JSON
4. Increment usage counter, return result page

**Payment flow:** User initiates → `send_token` button opens native Base USDC send → `?action=check-payment` queries Alchemy for recent transfers to known addresses, unlocked via Neynar FID→addresses lookup.

**Snap response shape:** All pages return a `SnapResponse` v2.0 object with `version`, `theme`, and `ui` containing named elements (text, button, input, badge, etc.). Elements reference each other via `children` arrays.

## Key Environment Variables

- `GEMINI_API_KEY` — Claude API key
- `ALCHEMY_API_KEY` — Base mainnet JSON-RPC
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — production persistence (not needed locally)
- `SNAP_PUBLIC_BASE_URL` — your Vercel URL (auto-detected if not set)
- `SKIP_JFS_VERIFICATION=1` — skip JFS verification in local dev
