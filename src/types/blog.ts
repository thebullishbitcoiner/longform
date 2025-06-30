// Nostr extension interface
export interface NostrExtension {
  getPublicKey(): Promise<string>;
  signEvent(event: any): Promise<any>;
  getRelays(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
}

// Extend Window interface to include nostr
declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

export interface BlogDraft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
} 