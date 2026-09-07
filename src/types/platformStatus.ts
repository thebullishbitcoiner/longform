/** Status fields returned for a pubkey (platform roster or unconfigured defaults). */
export type MeStatusFields = {
  pubkey: string;
  isLegend: boolean;
  /** True while PRO subscription is within paid period */
  isProSubscriptionActive: boolean;
  /** PRO subscription end (unix seconds), or null if never subscribed */
  proEndsAt: number | null;
  /** Expired PRO but within 21-day grace */
  isInRenewalGraceWindow: boolean;
  /** End of grace window (unix seconds), or null */
  graceEndsAt: number | null;
  /** Legend OR active PRO OR in PRO grace */
  isProForFeatures: boolean;
};

/** JSON when platform roster is active */
export type MeStatusResponse = MeStatusFields & {
  configured: true;
  source: 'platform';
};

/** JSON when PLATFORM_NSEC is missing or invalid (still HTTP 200) */
export type MeStatusUnconfiguredResponse = MeStatusFields & {
  configured: false;
  reason: 'missing_platform_nsec' | 'invalid_platform_nsec';
};

export type MeStatusApiResponse = MeStatusResponse | MeStatusUnconfiguredResponse;

export function emptyMeStatusFields(pubkey: string): MeStatusFields {
  return {
    pubkey,
    isLegend: false,
    isProSubscriptionActive: false,
    proEndsAt: null,
    isInRenewalGraceWindow: false,
    graceEndsAt: null,
    isProForFeatures: false,
  };
}
