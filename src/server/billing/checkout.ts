import { createBillingInvoice, isInvoiceSettled, type CreatedInvoice } from './platformWallet';
import {
  invoiceExpiryUnix,
  paymentHashFromInvoice,
  satoshisFromPaymentRequest,
} from './invoiceDecode';

export async function startCheckout(input: {
  amountSats: number;
  description: string;
  expirySec: number;
}): Promise<CreatedInvoice> {
  return createBillingInvoice(input);
}

export type CheckoutStatus = 'paid' | 'pending' | 'expired' | 'invalid';

export async function checkCheckoutStatus(input: {
  paymentRequest: string;
  expectedSats: number;
}): Promise<CheckoutStatus> {
  const sats = satoshisFromPaymentRequest(input.paymentRequest);
  const paymentHash = paymentHashFromInvoice(input.paymentRequest);
  if (sats === null || paymentHash === null || sats !== input.expectedSats) {
    return 'invalid';
  }

  const expiresAt = invoiceExpiryUnix(input.paymentRequest);
  const settled = await isInvoiceSettled(paymentHash);
  if (settled) return 'paid';

  if (expiresAt !== null && Math.floor(Date.now() / 1000) > expiresAt) {
    return 'expired';
  }
  return 'pending';
}
