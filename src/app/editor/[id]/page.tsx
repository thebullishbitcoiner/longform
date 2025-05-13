'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon, ClipboardIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { getDraft, updateDraft, Draft } from '@/utils/storage';
import { use } from 'react';
import Editor from '@/components/Editor';
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrEvent, NostrSigner } from '@nostrify/types';
import './page.css';

interface Nip07Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEvent): Promise<{ sig: string }>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const router = useRouter();
  const { id } = use(params);
  
  const signer: NostrSigner = {
    getPublicKey: async () => {
      const nostr = window.nostr as Nip07Signer | undefined;
      if (!nostr) {
        throw new Error('Nostr extension not found. Please install nos2x.');
      }
      return nostr.getPublicKey();
    },
    signEvent: async (event) => {
      const nostr = window.nostr as Nip07Signer | undefined;
      if (!nostr) {
        throw new Error('Nostr extension not found. Please install nos2x.');
      }
      const pubkey = await nostr.getPublicKey();
      const { sig } = await nostr.signEvent({
        ...event,
        pubkey,
        id: '', // This will be computed by the uploader
        sig: ''
      });
      return {
        ...event,
        pubkey,
        id: '', // This will be computed by the uploader
        sig
      };
    }
  };

  const uploader = new NostrBuildUploader({ 
    signer,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, init);
    }
  });

  useEffect(() => {
    const savedDraft = getDraft(id);
    if (!savedDraft) {
      router.push('/');
      return;
    }
    setDraft(savedDraft);
  }, [id, router]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    const updatedDraft = {
      ...draft,
      title: e.target.value,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    updateDraft(updatedDraft);
  };

  const handleSave = (updatedDraft: Draft) => {
    setDraft(updatedDraft);
    updateDraft(updatedDraft);
  };

  const handleCopy = () => {
    if (!draft) return;
    const content = `${draft.title}\n\n${draft.content}`;
    navigator.clipboard.writeText(content);
  };

  const handleImageUpload = async () => {
    if (!draft) return;

    const nostr = window.nostr as Nip07Signer | undefined;
    if (!nostr) {
      alert('Please install nos2x extension to upload images.');
      return;
    }

    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const [[_, url], ...tags] = await uploader.upload(file);
        
        // Insert the image markdown at the cursor position
        const imageMarkdown = `![${file.name}](${url})`;
        const updatedDraft = {
          ...draft,
          content: draft.content + '\n' + imageMarkdown + '\n',
          lastModified: new Date().toISOString(),
        };
        setDraft(updatedDraft);
        updateDraft(updatedDraft);
      } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image. Please try again.');
      }
    };

    input.click();
  };

  if (!draft) return null;

  return (
    <main className="container">
      <div className="editor-header">
        <button onClick={() => router.push('/')} className="back-button">
          <ArrowLeftIcon />
          Back to Drafts
        </button>
        <input
          type="text"
          value={draft.title}
          onChange={handleTitleChange}
          className="title-input"
          placeholder="Untitled Draft"
        />
      </div>
      <Editor draft={draft} onSave={handleSave} />
      <div className="editor-footer">
        <div className="editor-actions">
          <button 
            onClick={() => handleSave(draft)} 
            className="action-button save-button"
            title="Save Draft"
          >
            <CheckIcon />
            Save
          </button>
          <button 
            onClick={handleCopy} 
            className="action-button copy-button"
            title="Copy to Clipboard"
          >
            <ClipboardIcon />
            Copy
          </button>
          <button 
            onClick={handleImageUpload} 
            className="action-button image-button"
            title="Insert Image"
          >
            <PhotoIcon />
            Insert Image
          </button>
        </div>
      </div>
    </main>
  );
} 