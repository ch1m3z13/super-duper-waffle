// Shared payment verification logic.
// Used by both the Alchemy webhook (automatic) and the "check again" button (on-demand).

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const MINIMUM_USDC = 1.0;

// How far back to look for a payment (in blocks, ~24h on Base at ~2s/block)
const LOOKBACK_BLOCKS = 43_200;

function alchemyUrl(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY is not set");
  return `https://base-mainnet.g.alchemy.com/v2/${key}`;
}

// ---------------------------------------------------------------------------
// Check whether any of the given addresses sent us ≥1 USDC recently.
// Returns the matching transfer hash if found, or null.
// ---------------------------------------------------------------------------

export async function findPaymentFromAddresses(
  addresses: string[]
): Promise<{ found: true; txHash: string } | { found: false }> {
  const ourWallet = process.env.PAYMENT_WALLET_ADDRESS;
  if (!ourWallet) throw new Error("PAYMENT_WALLET_ADDRESS is not set");

  // Get current block number so we can calculate fromBlock
  const blockRes = await fetch(alchemyUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const blockData = (await blockRes.json()) as { result: string };
  const currentBlock = parseInt(blockData.result, 16);
  const fromBlock = `0x${Math.max(0, currentBlock - LOOKBACK_BLOCKS).toString(16)}`;

  // Fetch recent USDC transfers to our wallet
  const transferRes = await fetch(alchemyUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock,
          toAddress: ourWallet.toLowerCase(),
          contractAddresses: [USDC_ADDRESS],
          category: ["erc20"],
          order: "desc",
          maxCount: "0x64", // 100 transfers
        },
      ],
    }),
  });

  const transferData = (await transferRes.json()) as {
    result?: {
      transfers: {
        from: string;
        value: number;
        hash: string;
      }[];
    };
  };

  const transfers = transferData.result?.transfers ?? [];
  const lowercaseAddresses = addresses.map((a) => a.toLowerCase());

  const match = transfers.find(
    (t) =>
      lowercaseAddresses.includes(t.from?.toLowerCase()) &&
      (t.value ?? 0) >= MINIMUM_USDC
  );

  if (match) return { found: true, txHash: match.hash };
  return { found: false };
}
