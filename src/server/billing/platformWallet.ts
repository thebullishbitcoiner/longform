import { LN } from '@getalby/sdk';
import type { nwc } from '@getalby/sdk';

let cachedWallet: nwc.NWCClient | null = null;

/** Lazily connects to the platform's own Lightning wallet via NWC. */
export function getPlatformWallet(): nwc.NWCClient {
  if (cachedWallet) return cachedWallet;

  const nwcUrl = process.env.PLATFORM_NWC_URL?.trim();
  if (!nwcUrl) {
    throw new Error('PLATFORM_NWC_URL not configured');
  }

  cachedWallet = new LN(nwcUrl).nwcClient;
  return cachedWallet;
}

export type CreatedInvoice = {
  paymentRequest: string;
  expiresAt: number;
};

/** Creates a bolt11 invoice on the platform's own wallet. */
export async function createBillingInvoice(input: {
  amountSats: number;
  description: string;
  expirySec: number;
}): Promise<CreatedInvoice> {
  const wallet = getPlatformWallet();
  const tx = await wallet.makeInvoice({
    amount: input.amountSats * 1000,
    description: input.description,
    expiry: input.expirySec,
  });
  return {
    paymentRequest: tx.invoice,
    expiresAt: tx.expires_at,
  };
}

/** Asks the platform's own wallet whether it settled. Fails closed: any error means "not settled". */
export async function isInvoiceSettled(paymentHash: string): Promise<boolean> {
  try {
    const wallet = getPlatformWallet();
    const tx = await wallet.lookupInvoice({ payment_hash: paymentHash });
    return tx.state === 'settled';
  } catch {
    return false;
  }
}
