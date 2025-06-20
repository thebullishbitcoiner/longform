import { normalizePublicKey, isValidPublicKey } from '@/utils/nostr';

// Whitelist of approved public keys for alpha testing
// Add npub or hex public keys here to restrict access during alpha phase
export const WHITELISTED_PUBLIC_KEYS: string[] = [
  // Example: Add your approved testers' public keys here
  // 'npub1example...', // Replace with actual npub keys
  // '02a1b2c3d4e5f6...', // Or hex format public keys
  'npub1supp0rtpuvrvl7fj2nq7nhk6l4m4kfykxj0c3u9freahyufz3guq9qae45'
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