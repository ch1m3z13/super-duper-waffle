// Neynar API helpers for resolving between Farcaster FIDs and wallet addresses.
// Docs: https://docs.neynar.com/reference/lookup-user-by-address

function neynarKey(): string {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) throw new Error("NEYNAR_API_KEY is not set");
  return key;
}

// ---------------------------------------------------------------------------
// FID → addresses (custody + all verified ETH addresses)
// Used by the "check again" flow to know which addresses to scan for payment.
// ---------------------------------------------------------------------------

export async function getAddressesForFid(fid: number): Promise<string[]> {
  const res = await fetch(
    `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
    { headers: { api_key: neynarKey() } }
  );

  if (!res.ok) {
    console.error(`Neynar /user/bulk failed: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as {
    users?: {
      custody_address?: string;
      verified_addresses?: { eth_addresses?: string[] };
    }[];
  };

  const user = data.users?.[0];
  if (!user) return [];

  const addresses: string[] = [];
  if (user.custody_address) addresses.push(user.custody_address.toLowerCase());
  for (const addr of user.verified_addresses?.eth_addresses ?? []) {
    addresses.push(addr.toLowerCase());
  }

  return addresses;
}

// ---------------------------------------------------------------------------
// Address → FID
// Used by the webhook to turn an incoming payment sender into a Farcaster user.
// ---------------------------------------------------------------------------

export async function getFidForAddress(address: string): Promise<number | null> {
  const res = await fetch(
    `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address.toLowerCase()}`,
    { headers: { api_key: neynarKey() } }
  );

  if (!res.ok) {
    console.error(`Neynar /user/bulk-by-address failed: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as Record<
    string,
    { fid: number }[] | undefined
  >;

  const users = data[address.toLowerCase()];
  return users?.[0]?.fid ?? null;
}
