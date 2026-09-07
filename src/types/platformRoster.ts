/** Inner JSON (v1) before NIP-44 encryption, one event per PRO tier (monthly/yearly). */
export const PLATFORM_ROSTER_SCHEMA_V = 1 as const;

export type PlatformProRosterV1 = {
  v: typeof PLATFORM_ROSTER_SCHEMA_V;
  entries: Array<{ pubkey: string; endsAt: number }>;
};

/** Inner JSON (v1) before NIP-44 encryption, permanent Legend list. */
export type PlatformLegendRosterV1 = {
  v: typeof PLATFORM_ROSTER_SCHEMA_V;
  pubkeys: string[];
};

export function emptyProRoster(): PlatformProRosterV1 {
  return { v: PLATFORM_ROSTER_SCHEMA_V, entries: [] };
}

export function emptyLegendRoster(): PlatformLegendRosterV1 {
  return { v: PLATFORM_ROSTER_SCHEMA_V, pubkeys: [] };
}

/** Combined in-memory view used only for status resolution; never itself serialized to one event. */
export type PlatformRosterBundle = {
  monthly: PlatformProRosterV1;
  yearly: PlatformProRosterV1;
  legend: PlatformLegendRosterV1;
};
