/** Client-facing PRO subscription display (from platform roster / `/api/status/me`). */
export type ProStatus = {
  isPro: boolean;
  expiresAt?: string;
  /** True when paid period ended but still in 21-day renewal grace */
  isInBuffer?: boolean;
};
