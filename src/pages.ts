// All snap page shapes live here. Each function returns a valid SnapResponse.
// Kept separate so pages are easy to iterate on without touching server logic.

export type TxResult = {
  summary: string; // Plain-English explanation from Claude (≤240 chars)
  risk: "safe" | "warning" | "danger";
  riskReason?: string; // One sentence, shown for warning/danger
  gasPaid: string; // e.g. "0.000042 ETH"
  txType: string; // e.g. "Contract Interaction"
};

// USDC on Base (CAIP-19 format for send_token action)
const USDC_BASE = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ---------------------------------------------------------------------------
// Home page — tx hash input
// ---------------------------------------------------------------------------

export function homePage(base: string) {
  return {
    version: "2.0" as const,
    theme: { accent: "blue" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: {},
          children: ["title", "subtitle", "tx-input", "submit-btn"],
        },
        title: {
          type: "text" as const,
          props: { content: "WTF Just Happened? 🤔", weight: "bold" as const },
        },
        subtitle: {
          type: "text" as const,
          props: {
            content:
              "Paste any Base transaction hash and get a plain-English explanation — no crypto knowledge required.",
            size: "sm" as const,
          },
        },
        "tx-input": {
          type: "input" as const,
          props: {
            name: "tx",
            label: "Transaction Hash",
            placeholder: "0xabc123...",
            maxLength: 66,
          },
        },
        "submit-btn": {
          type: "button" as const,
          props: {
            label: "Explain this tx",
            variant: "primary" as const,
            icon: "zap" as const,
          },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/?action=explain` },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Result page — AI explanation + risk badge
// ---------------------------------------------------------------------------

export function resultPage(
  base: string,
  result: TxResult,
  _txHash: string,
  remaining: number
) {
  const riskColor =
    result.risk === "safe"
      ? ("green" as const)
      : result.risk === "warning"
      ? ("amber" as const)
      : ("red" as const);

  const riskLabel =
    result.risk === "safe"
      ? "✓ Looks fine"
      : result.risk === "warning"
      ? "⚠ Double-check this"
      : "✗ Red flag";

  const shareText = `Just decoded my onchain transaction with WTF Just Happened? 🤔\n\n"${result.summary.slice(0, 180)}"\n\nTry it 👇`;

  // Build summary text — append risk reason if present
  const summaryContent =
    result.riskReason
      ? `${result.summary}\n\n${result.riskReason}`
      : result.summary;

  // Root children: conditionally include "remaining" row
  // Max 7 root children allowed by spec
  const rootChildren =
    remaining > 0
      ? ["title", "risk-badge", "summary", "gas-row", "remaining-txt", "sep", "actions"]
      : ["title", "risk-badge", "summary", "gas-row", "sep", "actions"];

  return {
    version: "2.0" as const,
    theme: { accent: "blue" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: { gap: "sm" as const },
          children: rootChildren,
        },
        title: {
          type: "text" as const,
          props: { content: "Here's what happened:", weight: "bold" as const },
        },
        "risk-badge": {
          type: "badge" as const,
          props: { label: riskLabel, color: riskColor },
        },
        summary: {
          type: "text" as const,
          props: { content: summaryContent },
        },
        "gas-row": {
          type: "item" as const,
          props: {
            title: `Gas paid: ${result.gasPaid}`,
            description: result.txType,
          },
          children: [],
        },
        // Only rendered when remaining > 0
        "remaining-txt": {
          type: "text" as const,
          props: {
            content: `${remaining} free lookup${remaining === 1 ? "" : "s"} remaining`,
            size: "sm" as const,
            align: "center" as const,
          },
        },
        sep: {
          type: "separator" as const,
          props: {},
        },
        actions: {
          type: "stack" as const,
          props: { direction: "horizontal" as const, gap: "sm" as const },
          children: ["share-btn", "new-btn"],
        },
        "share-btn": {
          type: "button" as const,
          props: { label: "Share", icon: "share" as const },
          on: {
            press: {
              action: "compose_cast" as const,
              params: {
                text: shareText,
                embeds: [`${base}/`],
              },
            },
          },
        },
        "new-btn": {
          type: "button" as const,
          props: {
            label: "New lookup",
            variant: "primary" as const,
            icon: "refresh-cw" as const,
          },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/` },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Error page
// ---------------------------------------------------------------------------

export function errorPage(base: string, message: string) {
  return {
    version: "2.0" as const,
    theme: { accent: "red" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: {},
          children: ["title", "msg", "back-btn"],
        },
        title: {
          type: "text" as const,
          props: { content: "Couldn't decode that", weight: "bold" as const },
        },
        msg: {
          type: "text" as const,
          props: { content: message, size: "sm" as const },
        },
        "back-btn": {
          type: "button" as const,
          props: {
            label: "Try again",
            variant: "primary" as const,
            icon: "refresh-cw" as const,
          },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/` },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Locked page — free tier exhausted, single CTA to initiate payment
// ---------------------------------------------------------------------------

export function lockedPage(base: string) {
  return {
    version: "2.0" as const,
    theme: { accent: "purple" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: {},
          children: ["title", "msg", "unlock-btn", "back-btn"],
        },
        title: {
          type: "text" as const,
          props: { content: "Free lookups used up", weight: "bold" as const },
        },
        msg: {
          type: "text" as const,
          props: {
            content:
              "You've used your 3 free lookups. Unlock unlimited access for 1 USDC — takes about a minute to confirm.",
            size: "sm" as const,
          },
        },
        "unlock-btn": {
          type: "button" as const,
          props: {
            label: "Unlock for 1 USDC",
            variant: "primary" as const,
            icon: "coins" as const,
          },
          on: {
            // Submit → server records intent, returns paymentPendingPage
            // which shows both the send_token button AND the "check again" button
            press: {
              action: "submit" as const,
              params: { target: `${base}/?action=initiate-payment` },
            },
          },
        },
        "back-btn": {
          type: "button" as const,
          props: { label: "Back", icon: "arrow-left" as const },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/` },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Payment pending page — shown after user clicks "Unlock for 1 USDC"
// Now shows send_token + "I already paid — check again"
// ---------------------------------------------------------------------------

export function paymentPendingPage(base: string) {
  return {
    version: "2.0" as const,
    theme: { accent: "purple" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: {},
          children: ["title", "step1", "send-btn", "sep", "step2", "check-btn"],
        },
        title: {
          type: "text" as const,
          props: { content: "Send 1 USDC to unlock", weight: "bold" as const },
        },
        step1: {
          type: "text" as const,
          props: {
            content: "Step 1 — tap below to open the send flow, then confirm the 1 USDC payment.",
            size: "sm" as const,
          },
        },
        "send-btn": {
          type: "button" as const,
          props: {
            label: "Send 1 USDC",
            variant: "primary" as const,
            icon: "coins" as const,
          },
          on: {
            press: {
              action: "send_token" as const,
              params: {
                token: USDC_BASE,
                amount: "1.00",
                // Set your receiving wallet address here:
                // recipientAddress: process.env.PAYMENT_WALLET_ADDRESS,
              },
            },
          },
        },
        sep: {
          type: "separator" as const,
          props: {},
        },
        step2: {
          type: "text" as const,
          props: {
            content: "Step 2 — once you've sent the payment, tap below to verify.",
            size: "sm" as const,
          },
        },
        "check-btn": {
          type: "button" as const,
          props: {
            label: "I already paid — check",
            icon: "refresh-cw" as const,
          },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/?action=check-payment` },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Still waiting page — payment not found yet
// ---------------------------------------------------------------------------

export function stillWaitingPage(base: string) {
  return {
    version: "2.0" as const,
    theme: { accent: "purple" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: {},
          children: ["title", "msg", "hint", "retry-btn", "back-btn"],
        },
        title: {
          type: "text" as const,
          props: { content: "Payment not found yet", weight: "bold" as const },
        },
        msg: {
          type: "text" as const,
          props: {
            content:
              "We checked the last 24 hours of transfers but couldn't find your payment. Base transactions usually confirm in under 2 seconds.",
            size: "sm" as const,
          },
        },
        hint: {
          type: "text" as const,
          props: {
            content:
              "Make sure you sent from a wallet address connected to your Farcaster account.",
            size: "sm" as const,
          },
        },
        "retry-btn": {
          type: "button" as const,
          props: {
            label: "Check again",
            variant: "primary" as const,
            icon: "refresh-cw" as const,
          },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/?action=check-payment` },
            },
          },
        },
        "back-btn": {
          type: "button" as const,
          props: { label: "Back to payment", icon: "arrow-left" as const },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/?action=initiate-payment` },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Unlocked page — payment confirmed!
// ---------------------------------------------------------------------------

export function unlockedPage(base: string) {
  return {
    version: "2.0" as const,
    effects: ["confetti"] as ["confetti"],
    theme: { accent: "green" as const },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack" as const,
          props: {},
          children: ["title", "msg", "go-btn"],
        },
        title: {
          type: "text" as const,
          props: {
            content: "You're unlocked! 🎉",
            weight: "bold" as const,
            align: "center" as const,
          },
        },
        msg: {
          type: "text" as const,
          props: {
            content:
              "Payment confirmed. You now have unlimited transaction lookups — enjoy!",
            size: "sm" as const,
            align: "center" as const,
          },
        },
        "go-btn": {
          type: "button" as const,
          props: {
            label: "Explain a transaction",
            variant: "primary" as const,
            icon: "zap" as const,
          },
          on: {
            press: {
              action: "submit" as const,
              params: { target: `${base}/` },
            },
          },
        },
      },
    },
  };
}
