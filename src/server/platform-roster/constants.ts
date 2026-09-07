export const PLATFORM_PRO_MONTHLY_D_TAG = 'longform-pro-monthly';
export const PLATFORM_PRO_YEARLY_D_TAG = 'longform-pro-yearly';
export const PLATFORM_LEGEND_D_TAG = 'longform-legend';

export type PlatformProTier = 'monthly' | 'yearly';

export function dTagForProTier(tier: PlatformProTier): string {
  return tier === 'monthly' ? PLATFORM_PRO_MONTHLY_D_TAG : PLATFORM_PRO_YEARLY_D_TAG;
}

/** All three platform d-tags, for the single combined status-read query. */
export const ALL_PLATFORM_D_TAGS = [
  PLATFORM_PRO_MONTHLY_D_TAG,
  PLATFORM_PRO_YEARLY_D_TAG,
  PLATFORM_LEGEND_D_TAG,
] as const;
