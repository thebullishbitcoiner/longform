import NDK from '@nostr-dev-kit/ndk';
import { NDKSigner, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';

export class Nip07Signer implements NDKSigner {
  private _pubkey: string | null = null;
  private _ndk: NDK;

  constructor(ndk: NDK) {
    this._ndk = ndk;
  }

  async blockUntilReady(): Promise<NDKUser> {
    if (!window.nostr) {
      throw new Error('window.nostr not available - Please install a Nostr extension');
    }

    const pubkey = await window.nostr.getPublicKey();
    if (!pubkey) {
      throw new Error('No public key available from Nostr extension');
    }

    this._pubkey = pubkey;
    return this._ndk.getUser({ pubkey });
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
    if (!this._pubkey) {
      await this.blockUntilReady();
    }
    return window.nostr.nip44.encrypt(this._pubkey!, value);
  }

  // NIP-44 decryption (self-decryption)
  async decryptNip44(value: string): Promise<string> {
    if (!window.nostr?.nip44) {
      throw new Error('NIP-44 decryption not available');
    }
    if (!this._pubkey) {
      await this.blockUntilReady();
    }
    return window.nostr.nip44.decrypt(this._pubkey!, value);
  }

  toPayload(): string {
    return JSON.stringify({
      pubkey: this._pubkey,
      type: 'nip07'
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

