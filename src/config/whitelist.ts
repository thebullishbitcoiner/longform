import { normalizePublicKey, isValidPublicKey } from '@/utils/nostr';

// Whitelist of approved public keys for alpha testing
// Add npub or hex public keys here to restrict access during alpha phase
export const ALPHA_WHITELIST: string[] = [
  'npub1supp0rtpuvrvl7fj2nq7nhk6l4m4kfykxj0c3u9freahyufz3guq9qae45', //Nostr Support
  'npub15ypxpg429uyjmp0zczuza902chuvvr4pn35wfzv8rx6cej4z8clq6jmpcx', //thebullishbitcoiner
  'npub1ezn0mds24xca744nvrs2kkhpfhnvju92cg62avfgz7sc35xuzdgqlesxpt', //eznomada
  'npub1marc26z8nh3xkj5rcx7ufkatvx6ueqhp5vfw9v5teq26z254renshtf3g0', //Marc
  'npub1l59ulrx34m5rle67ds8al32rs309hsl4p5nd9409cmfl55slnrqq8jq78u', //Rare
  'npub1468024mrwz6uhywjvt8s6vw4e604egnv8tfd2m2utrmqyd3nu3fsutvgjn', //Connie
  'npub1aeh2zw4elewy5682lxc6xnlqzjnxksq303gwu2npfaxd49vmde6qcq4nwx', //The Daniel
  'npub17nd4yu9anyd3004pumgrtazaacujjxwzj36thtqsxskjy0r5urgqf6950x', //isolabellart
  'npub19aftr8lpgz8knmswjz0d3l9vzwx97dcvqh0zfuxcxu9d57t4yv3sz4v28l', //Diyana
  'npub1w60s85hfvszc0y6gn3cxj5ddzz5fw6qzz7u6pnyaec2xc2eksnes6n5ftw', //TJ.III
  'npub13fz04jej7nktvtvg24dj926a5ctcmaw6ekp9028eux3pz3csxdrqgd77yu', //SelfBankt
  'npub1nl8r463jkdtr0qu0k3dht03jt9t59cttk0j8gtxg9wea2russlnq2zf9d0', //heatherlarson
  'npub1kun5628raxpm7usdkj62z2337hr77f3ryrg9cf0vjpyf4jvk9r9smv3lhe', //dikaios1517
  'npub19ma2w9dmk3kat0nt0k5dwuqzvmg3va9ezwup0zkakhpwv0vcwvcsg8axkl', //vinney
  'npub1xe36pc9dk2emzulxw0tp8ytlthpty80ry89w5rw3k28fdyzalprq0au0nh', //FEW_BTC
  'npub1hqva2radggqltaj8n7vqpj9pkddc7lf6cmsuchm3dp4kr52syeqsrap4sd', //modulo
  'npub1wf0w8jcnhav6wu7umz2pg6hzrcvt3h874h5g7uq9p0r3m8taxsssfafcny', //Ryan Matta
  'npub1mgvmt553uphdpxa9gk79xejq3hyzh2xfa8uh6vh236nq78mvh74q8tr9yd', //n0>1
  'npub1ftkx02mg3u6l6ksfzv6r0nzed03cqcmy9me3vf75zkcjeca0alvq7lskzl', //Dave Plotz
];

// Enable/disable whitelist checking
export const ENABLE_WHITELIST = true;

// Helper function to check if a public key is whitelisted
export const isWhitelisted = (publicKey: string): boolean => {
  console.log('🔍 Checking whitelist for public key:', publicKey);
  console.log('📋 Whitelist status:', {
    enabled: ENABLE_WHITELIST,
    keysCount: ALPHA_WHITELIST.length,
    keys: ALPHA_WHITELIST
  });

  if (!ENABLE_WHITELIST) {
    console.log('✅ Whitelist disabled - allowing all users');
    return true; // If whitelist is disabled, allow all users
  }

  if (ALPHA_WHITELIST.length === 0) {
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
  const isWhitelisted = ALPHA_WHITELIST.some(whitelistedKey => {
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
  if (ALPHA_WHITELIST.some(key => normalizePublicKey(key) === normalized)) {
    console.warn('Public key already in whitelist:', publicKey);
    return false;
  }

  // Add to whitelist (this would need to be persisted in a real implementation)
  ALPHA_WHITELIST.push(publicKey);
  return true;
}; 