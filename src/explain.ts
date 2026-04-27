// Transaction decoding via Alchemy + plain-English explanation via Ollama.
// All network calls are isolated here so they're easy to mock in tests.

import type { TxResult } from "./pages.js";

// ---------------------------------------------------------------------------
// Alchemy RPC helper (Base mainnet)
// ---------------------------------------------------------------------------

function alchemyUrl(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY is not set");
  return `https://base-mainnet.g.alchemy.com/v2/${key}`;
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(alchemyUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);

  const data = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`Alchemy RPC error: ${data.error.message}`);
  return data.result;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

function weiToEth(weiHex: string): string {
  const wei = BigInt(weiHex);
  if (wei === 0n) return "0 ETH";
  const eth = Number(wei) / 1e18;
  if (eth < 0.000001) {
    const gwei = Number(wei) / 1e9;
    return `${gwei.toFixed(4)} Gwei`;
  }
  return `${eth.toFixed(6)} ETH`;
}

function classify(tx: AlchemyTx, receipt: AlchemyReceipt | null): string {
  if (!tx.to) return "Contract Deploy";
  if (!tx.input || tx.input === "0x") return "ETH Transfer";
  if (receipt?.logs && receipt.logs.length > 0) return "Contract Interaction";
  return "Contract Call";
}

// ---------------------------------------------------------------------------
// Types (minimal — only what we need)
// ---------------------------------------------------------------------------

interface AlchemyTx {
  from: string;
  to: string | null;
  value: string;
  input: string;
  gasPrice: string | null;
  maxFeePerGas: string | null;
}

interface AlchemyReceipt {
  status: string;
  gasUsed: string;
  contractAddress: string | null;
  logs: { address: string; topics: string[] }[];
}

// ---------------------------------------------------------------------------
// Ollama API
// ---------------------------------------------------------------------------

function ollamaUrl(): string {
  const key = process.env.OLLAMA_API_KEY;
  if (key) {
    // Ollama Cloud — uses api.ollama.ai with Bearer token
    return "https://api.ollama.ai/chat";
  }
  // Local Ollama
  const localUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  return `${localUrl}/api/chat`;
}

function ollamaModel(): string {
  return process.env.OLLAMA_MODEL ?? "llama3.2";
}

async function askOllama(systemPrompt: string, userContent: string): Promise<string> {
  const url = ollamaUrl();
  const model = ollamaModel();
  const key = process.env.OLLAMA_API_KEY;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function explainTransaction(txHash: string): Promise<TxResult> {
  const [tx, receipt] = await Promise.all([
    rpc("eth_getTransactionByHash", [txHash]) as Promise<AlchemyTx | null>,
    rpc("eth_getTransactionReceipt", [txHash]) as Promise<AlchemyReceipt | null>,
  ]);

  if (!tx) throw new Error("Transaction not found");

  const gasUsed = receipt ? hexToNumber(receipt.gasUsed) : 0;
  const gasPrice = tx.gasPrice
    ? hexToNumber(tx.gasPrice)
    : tx.maxFeePerGas
    ? hexToNumber(tx.maxFeePerGas)
    : 0;
  const gasCostWei = `0x${(gasUsed * gasPrice).toString(16)}`;

  const gasPaid = weiToEth(gasCostWei);
  const value = tx.value !== "0x0" ? weiToEth(tx.value) : null;
  const status = receipt?.status === "0x1" ? "succeeded" : receipt ? "failed" : "pending";
  const txType = classify(tx, receipt);

  const txContext = {
    from: tx.from,
    to: tx.to ?? "(new contract)",
    value: value ? `${value} transferred` : "no ETH transferred",
    gasUsed,
    gasPaid,
    status,
    type: txType,
    functionSelector:
      tx.input && tx.input.length >= 10 && tx.input !== "0x"
        ? tx.input.slice(0, 10)
        : null,
    eventCount: receipt?.logs?.length ?? 0,
    contractDeployed: receipt?.contractAddress ?? null,
  };

  const systemPrompt = `You are a blockchain transaction explainer for complete beginners on the Base network.

Given raw transaction data, respond ONLY with a valid JSON object. No markdown, no backticks, no extra text.

Required fields:
{
  "summary": "1-2 sentences in plain English (max 220 chars). No jargon. Start with 'You' or 'Someone'.",
  "risk": "safe" | "warning" | "danger",
  "riskReason": "One clear sentence (max 100 chars) — REQUIRED if risk is warning or danger, omit if safe"
}

Risk guide:
- safe: normal transfer, swap, or mint. Status succeeded.
- warning: failed transaction, unusual gas, interaction with unknown contract.
- danger: potential scam pattern, approval of unlimited tokens, suspicious address.`;

  let rawText: string;
  try {
    rawText = await askOllama(systemPrompt, `Explain this Base network transaction:\n${JSON.stringify(txContext, null, 2)}`);
  } catch (err) {
    console.error("askOllama failed:", err);
    throw err;
  }

  let parsed: {
    summary: string;
    risk: "safe" | "warning" | "danger";
    riskReason?: string;
  };

  try {
    parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch {
    parsed = {
      summary: `This ${txType.toLowerCase()} ${status} on the Base network.`,
      risk: status === "failed" ? "warning" : "safe",
      riskReason:
        status === "failed"
          ? "The transaction failed — no funds were lost but you still paid gas."
          : undefined,
    };
  }

  return {
    summary: (parsed.summary ?? "").slice(0, 240),
    risk: parsed.risk ?? "safe",
    riskReason: parsed.riskReason,
    gasPaid,
    txType,
  };
}
