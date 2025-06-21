import { normalizePublicKey, isValidPublicKey } from '@/utils/nostr';

// Whitelist of approved public keys for alpha testing
// Add npub or hex public keys here to restrict access during alpha phase
export const WHITELISTED_PUBLIC_KEYS: string[] = [
  // Example: Add your approved testers' public keys here
  // 'npub1example...', // Replace with actual npub keys
  // '02a1b2c3d4e5f6...', // Or hex format public keys
  'npub1supp0rtpuvrvl7fj2nq7nhk6l4m4kfykxj0c3u9freahyufz3guq9qae45', //Nostr Support
  'npub15ypxpg429uyjmp0zczuza902chuvvr4pn35wfzv8rx6cej4z8clq6jmpcx', //thebullishbitcoiner
  'npub1w60s85hfvszc0y6gn3cxj5ddzz5fw6qzz7u6pnyaec2xc2eksnes6n5ftw', //TJ.III
  'npub17nd4yu9anyd3004pumgrtazaacujjxwzj36thtqsxskjy0r5urgqf6950x', //isolabellart
  'npub1aeh2zw4elewy5682lxc6xnlqzjnxksq303gwu2npfaxd49vmde6qcq4nwx', //The Daniel
  'npub1468024mrwz6uhywjvt8s6vw4e604egnv8tfd2m2utrmqyd3nu3fsutvgjn', //Connie
  'npub1l59ulrx34m5rle67ds8al32rs309hsl4p5nd9409cmfl55slnrqq8jq78u', //Rare
  'npub1marc26z8nh3xkj5rcx7ufkatvx6ueqhp5vfw9v5teq26z254renshtf3g0', //Marc
  'npub1ezn0mds24xca744nvrs2kkhpfhnvju92cg62avfgz7sc35xuzdgqlesxpt', //eznomada
];

// Enable/disable whitelist checking
export const ENABLE_WHITELIST = true;

// Helper function to check if a public key is whitelisted
export const isWhitelisted = (publicKey: string): boolean => {
  console.log('🔍 Checking whitelist for public key:', publicKey);
  console.log('📋 Whitelist status:', {
    enabled: ENABLE_WHITELIST,
    keysCount: WHITELISTED_PUBLIC_KEYS.length,
    keys: WHITELISTED_PUBLIC_KEYS
  });

  if (!ENABLE_WHITELIST) {
    console.log('✅ Whitelist disabled - allowing all users');
    return true; // If whitelist is disabled, allow all users
  }

  if (WHITELISTED_PUBLIC_KEYS.length === 0) {
    console.log('🚫 Whitelist enabled but empty - denying all users');
    return false; // If whitelist is empty, deny all users
  }

  // Normalize the input public key to hex format
  const normalizedInput = normalizePublicKey(publicKey);
  if (!normalizedInput) {
    console.warn('❌ Invalid public key format:', publicKey);
    return false;
  }

  console.log('🔧 Normalized input key:', normalizedInput);

  // Check if the normalized public key matches any in the whitelist
  const isWhitelisted = WHITELISTED_PUBLIC_KEYS.some(whitelistedKey => {
    const normalizedWhitelisted = normalizePublicKey(whitelistedKey);
    const matches = normalizedWhitelisted && normalizedWhitelisted === normalizedInput;
    console.log('🔍 Comparing with whitelisted key:', {
      original: whitelistedKey,
      normalized: normalizedWhitelisted,
      matches: matches
    });
    return matches;
  });

  console.log('📋 Final whitelist check result:', isWhitelisted);
  return isWhitelisted;
};

// Helper function to validate and add a public key to the whitelist
export const addToWhitelist = (publicKey: string): boolean => {
  if (!isValidPublicKey(publicKey)) {
    console.error('Invalid public key format:', publicKey);
    return false;
  }

  const normalized = normalizePublicKey(publicKey);
  if (!normalized) {
    return false;
  }

  // Check if already in whitelist
  if (WHITELISTED_PUBLIC_KEYS.some(key => normalizePublicKey(key) === normalized)) {
    console.warn('Public key already in whitelist:', publicKey);
    return false;
  }

  // Add to whitelist (this would need to be persisted in a real implementation)
  WHITELISTED_PUBLIC_KEYS.push(publicKey);
  return true;
}; 