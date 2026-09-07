export type CheckoutStatus = 'paid' | 'pending' | 'expired' | 'invalid';

const POLL_INTERVAL_MS = 2_000;

/**
 * Shows a server-generated invoice in the bitcoin-connect pay modal (UI only —
 * settlement is never trusted from the modal itself) and polls `checkStatus`
 * until it reports a terminal state.
 */
export async function payGeneratedInvoice(
  paymentRequest: string,
  expiresAt: number,
  checkStatus: () => Promise<CheckoutStatus>
): Promise<CheckoutStatus | 'cancelled'> {
  const { launchPaymentModal, closeModal } = await import('@getalby/bitcoin-connect');

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: CheckoutStatus | 'cancelled') => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      closeModal();
      resolve(result);
    };

    const runCheck = async () => {
      try {
        const status = await checkStatus();
        if (status === 'paid' || status === 'expired' || status === 'invalid') {
          finish(status);
        }
      } catch {
        // transient network error — keep polling until the deadline
      }
    };

    launchPaymentModal({
      invoice: paymentRequest,
      onCancelled: () => finish('cancelled'),
      onPaid: () => {
        void runCheck();
      },
    });

    pollTimer = setInterval(runCheck, POLL_INTERVAL_MS);

    const msUntilExpiry = Math.max(0, expiresAt * 1000 - Date.now());
    deadlineTimer = setTimeout(() => finish('expired'), msUntilExpiry);
  });
}
