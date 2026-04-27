# WTF Just Happened? 🤔

A Farcaster Snap that explains any Base transaction in plain English using Claude AI.

## How it works

1. User pastes a transaction hash into the snap
2. Server fetches the tx from Alchemy (Base mainnet)
3. Claude explains it in 1–2 plain English sentences + flags risk level
4. Result is shareable via a pre-filled `compose_cast` button
5. Free tier: 3 lookups per Farcaster FID. Then 1 USDC to unlock unlimited.

## Tech stack

- **Snap server**: Hono + `@farcaster/snap-hono`
- **Persistence**: `@farcaster/snap-turso` (in-memory locally, Turso in prod)
- **Tx data**: Alchemy JSON-RPC (Base mainnet)
- **AI**: Claude (`claude-sonnet-4-20250514`) via Anthropic API
- **Deploy**: Vercel

---

## Local development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Fill in GEMINI_API_KEY and ALCHEMY_API_KEY
```

### 3. Start the dev server

```bash
pnpm dev
# Runs on http://localhost:3003
```

### 4. Test in the Farcaster Snap Emulator

Open <https://farcaster.xyz/~/developers/snaps> and enter:

```
http://localhost:3003/
```

The emulator signs messages automatically, so no wallet needed for local testing.

---

## Deploying to Vercel

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
vercel

# Set your env vars in the Vercel dashboard, then:
vercel env add GEMINI_API_KEY
vercel env add ALCHEMY_API_KEY
vercel env add SNAP_PUBLIC_BASE_URL   # your Vercel URL, no trailing slash
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN

# Redeploy with env vars
vercel --prod
```

### Verify the deployment

```bash
curl -sS -H 'Accept: application/vnd.farcaster.snap+json' https://your-snap.vercel.app/
# Should return valid snap JSON
```

---

## Setting up Turso (production persistence)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Log in and create a DB
turso auth login
turso db create wtfjusthappened

# Get your credentials
turso db show wtfjusthappened --url   # → TURSO_DATABASE_URL
turso db tokens create wtfjusthappened # → TURSO_AUTH_TOKEN
```

---

## Unlocking after payment (TODO for production)

The `lockedPage` opens the native Base send flow for 1 USDC. To automatically
detect payment and reset the user's usage count, you have two options:

**Option A — Alchemy Notify webhook:**
Set up a webhook to call your `/api/payment` endpoint on incoming USDC transfers
to your wallet. Match the sender's address to a Farcaster FID via Neynar's API,
then call `store.set(`usage:${fid}`, 0)`.

**Option B — On-demand check:**
Add a `?action=check-payment` route that queries Alchemy for recent USDC transfers
to your address and resets usage if a qualifying payment is found. Show a
"I already paid — check again" button on the locked page.

---

## Project structure

```
src/
  index.ts    — Hono app, snap handler, freemium gate
  pages.ts    — All SnapResponse shapes (home, result, error, locked)
  explain.ts  — Alchemy RPC + Claude AI explanation
```
