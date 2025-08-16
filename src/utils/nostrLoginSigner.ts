import NDK from '@nostr-dev-kit/ndk';
import { NDKSigner, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { bech32 } from 'bech32';

export class NostrLoginSigner implements NDKSigner {
  private _pubkey: string | null = null;
  private _ndk: NDK;

  constructor(ndk: NDK) {
    this._ndk = ndk;
  }

  async blockUntilReady(): Promise<NDKUser> {
    if (!window.nostr) {
      throw new Error('window.nostr not available - nostr-login may not be initialized');
    }

    const pubkey = await window.nostr.getPublicKey();
    if (!pubkey) {
      throw new Error('No public key available from nostr-login');
    }

    this._pubkey = pubkey;
    return this._ndk.getUser({ pubkey });
  }

  // Convert hex pubkey to npub format
  private hexToNpub(hex: string): string {
    try {
      const words = bech32.toWords(Buffer.from(hex, 'hex'));
      return bech32.encode('npub', words);
    } catch (error) {
      console.error('Error converting hex to npub:', error);
      return hex; // Fallback to hex if conversion fails
    }
  }

  async sign(event: NostrEvent): Promise<string> {
    if (!window.nostr) {
      throw new Error('window.nostr not available');
    }

    const signedEvent = await window.nostr.signEvent(event);
    return signedEvent.sig;
  }

  async user(): Promise<NDKUser> {
    if (!this._pubkey) {
      await this.blockUntilReady();
    }
    return this._ndk.getUser({ pubkey: this._pubkey! });
  }

  async encrypt(recipient: NDKUser, value: string): Promise<string> {
    if (!window.nostr?.nip04) {
      throw new Error('NIP-04 encryption not available');
    }
    return window.nostr.nip04.encrypt(recipient.pubkey, value);
  }

  async decrypt(sender: NDKUser, value: string): Promise<string> {
    if (!window.nostr?.nip04) {
      throw new Error('NIP-04 decryption not available');
    }
    return window.nostr.nip04.decrypt(sender.pubkey, value);
  }

  // NIP-44 encryption (self-encryption)
  async encryptNip44(value: string): Promise<string> {
    if (!window.nostr?.nip44) {
      throw new Error('NIP-44 encryption not available');
    }
    return window.nostr.nip44.encrypt(this._pubkey!, value);
  }

  // NIP-44 decryption (self-decryption)
  async decryptNip44(value: string): Promise<string> {
    if (!window.nostr?.nip44) {
      throw new Error('NIP-44 decryption not available');
    }
    return window.nostr.nip44.decrypt(this._pubkey!, value);
  }

  toPayload(): string {
    return JSON.stringify({
      pubkey: this._pubkey,
      type: 'nostr-login'
    });
  }

  get pubkey(): string {
    if (!this._pubkey) {
      throw new Error('Public key not available - call blockUntilReady() first');
    }
    return this._pubkey;
  }

  get userSync(): NDKUser {
    if (!this._pubkey) {
      throw new Error('User not available - call blockUntilReady() first');
    }
    return this._ndk.getUser({ pubkey: this._pubkey });
  }
} 