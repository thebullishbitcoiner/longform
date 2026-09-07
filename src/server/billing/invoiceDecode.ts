import { decode } from 'bolt11';

function paymentHashHex(data: unknown): string | null {
  if (typeof data === 'string') {
    const s = data.toLowerCase();
    return /^[0-9a-f]{64}$/.test(s) ? s : null;
  }
  if (Buffer.isBuffer(data)) return data.toString('hex').toLowerCase();
  if (data instanceof Uint8Array) return Buffer.from(data).toString('hex').toLowerCase();
  return null;
}

export function paymentHashFromInvoice(paymentRequest: string): string | null {
  try {
    const decoded = decode(paymentRequest.trim());
    const tag = decoded.tags.find((t) => t.tagName === 'payment_hash');
    if (tag?.data) {
      const fromTag = paymentHashHex(tag.data);
      if (fromTag) return fromTag;
    }
    const fromObj = decoded.tagsObject?.payment_hash;
    if (fromObj) return paymentHashHex(fromObj);
    return null;
  } catch {
    return null;
  }
}

export function satoshisFromPaymentRequest(paymentRequest: string): number | null {
  try {
    const decoded = decode(paymentRequest.trim());
    if (decoded.satoshis != null) return decoded.satoshis;
    if (decoded.millisatoshis != null) return Math.floor(Number(decoded.millisatoshis) / 1000);
    return null;
  } catch {
    return null;
  }
}

const DEFAULT_BOLT11_EXPIRY_SEC = 3600;

/** Absolute unix-seconds expiry encoded in the invoice (creation timestamp + expiry tag). */
export function invoiceExpiryUnix(paymentRequest: string): number | null {
  try {
    const decoded = decode(paymentRequest.trim());
    if (decoded.timestamp == null) return null;
    const expirySec = decoded.timeExpireDate != null
      ? decoded.timeExpireDate - decoded.timestamp
      : DEFAULT_BOLT11_EXPIRY_SEC;
    return decoded.timestamp + expirySec;
  } catch {
    return null;
  }
}
