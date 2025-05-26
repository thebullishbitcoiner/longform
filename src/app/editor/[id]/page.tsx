'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon, ClipboardIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { getDraft, updateDraft, Draft } from '@/utils/storage';
import { use } from 'react';
import Editor from '@/components/Editor';
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrEvent, NostrSigner } from '@nostrify/types';
import NostrLogin from '@/components/NostrLogin';
import './page.css';

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const { id } = use(params);
  
  useEffect(() => {
    const checkAuth = () => {
      const nostr = window.nostr;
      if (nostr) {
        setIsAuthenticated(true);
      }
    };

    // Check initial auth state
    checkAuth();

    // Listen for nostr-login events
    window.addEventListener('nostr-login:success', checkAuth);
    window.addEventListener('nostr-login:logout', () => setIsAuthenticated(false));

    return () => {
      window.removeEventListener('nostr-login:success', checkAuth);
      window.removeEventListener('nostr-login:logout', () => setIsAuthenticated(false));
    };
  }, []);

  const signer: NostrSigner = {
    getPublicKey: async () => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated. Please log in with nostr-login.');
      }
      const nostr = window.nostr;
      if (!nostr) {
        throw new Error('Nostr extension not found. Please log in with nostr-login.');
      }
      return nostr.getPublicKey();
    },
    signEvent: async (event) => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated. Please log in with nostr-login.');
      }
      const nostr = window.nostr;
      if (!nostr) {
        throw new Error('Nostr extension not found. Please log in with nostr-login.');
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

    if (!isAuthenticated) {
      alert('Please log in with nostr-login to upload images.');
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
        const [[, url]] = await uploader.upload(file);
        
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