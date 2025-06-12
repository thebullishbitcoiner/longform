'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { getDraft, updateDraft, Draft } from '@/utils/storage';
import { use } from 'react';
import Editor from '@/components/Editor';
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrSigner } from '@nostrify/types';
import { useNostr } from '@/contexts/NostrContext';
import toast from 'react-hot-toast';
import './page.css';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const router = useRouter();
  const { id } = use(params);
  const { ndk, isConnected, isAuthenticated } = useNostr();
  
  useEffect(() => {
    const savedDraft = getDraft(id);
    if (!savedDraft) {
      router.push('/');
      return;
    }
    setDraft(savedDraft);
  }, [id, router]);

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

  const handleSave = async (updatedDraft: Draft) => {
    // Save to local storage
    setDraft(updatedDraft);
    updateDraft(updatedDraft);

    // If authenticated, also save to Nostr
    if (ndk && isAuthenticated) {
      try {
        setIsPublishing(true);
        console.log('Editor: Starting save process...');

        // Check if we have any connected relays
        const connectedRelays = ndk.pool.connectedRelays();
        console.log('Editor: Connected relays:', connectedRelays.map(r => r.url).join(', '));
        if (connectedRelays.length === 0) {
          console.log('Editor: No connected relays found');
          toast.error('No connected relays. Please check your connection.');
          return;
        }

        // Create and publish the event using NDK's methods
        const ndkEvent = new NDKEvent(ndk);
        ndkEvent.kind = 30024;
        ndkEvent.content = updatedDraft.content;
        ndkEvent.tags = [
          ['title', updatedDraft.title],
          ['published_at', Math.floor(Date.now() / 1000).toString()],
          ['t', 'longform']
        ];
        ndkEvent.created_at = Math.floor(Date.now() / 1000);

        console.log('Editor: Publishing event:', {
          kind: ndkEvent.kind,
          content: ndkEvent.content,
          tags: ndkEvent.tags,
          created_at: ndkEvent.created_at
        });

        // Try to publish with a timeout
        const publishPromise = ndkEvent.publish();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Publishing timed out')), 10000)
        );

        await Promise.race([publishPromise, timeoutPromise]);
        toast.success('Saved locally and to Nostr!');
      } catch (error: unknown) {
        console.error('Error saving to Nostr:', error);
        if (error instanceof Error) {
          if (error.message?.includes('timed out')) {
            toast.error('Relay connection timed out. Please try again.');
          } else if (error.message?.includes('Not enough relays')) {
            toast.error('Could not connect to any relays. Please check your connection.');
          } else {
            toast.error('Saved locally, but failed to save to Nostr.');
          }
        } else {
          toast.error('Saved locally, but failed to save to Nostr.');
        }
      } finally {
        setIsPublishing(false);
      }
    }
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

  const handlePublish = async () => {
    if (!draft || !ndk || !isAuthenticated) {
      toast.error('Please log in with nostr-login to publish.');
      return;
    }

    try {
      setIsPublishing(true);

      // Create and publish the event using NDK's methods
      const ndkEvent = new NDKEvent(ndk);
      ndkEvent.kind = 30023;
      ndkEvent.content = draft.content;
      ndkEvent.tags = [
        ['title', draft.title],
        ['published_at', Math.floor(Date.now() / 1000).toString()],
        ['t', 'longform']
      ];
      ndkEvent.created_at = Math.floor(Date.now() / 1000);

      console.log('Editor: Publishing article:', {
        kind: ndkEvent.kind,
        content: ndkEvent.content,
        tags: ndkEvent.tags,
        created_at: ndkEvent.created_at
      });

      await ndkEvent.publish();
      toast.success('Published successfully!');
      router.push('/reader'); // Redirect to reader page
    } catch (error) {
      console.error('Error publishing:', error);
      toast.error('Failed to publish. Please try again.');
    } finally {
      setIsPublishing(false);
    }
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
            onClick={handleImageUpload} 
            className="action-button image-button"
            title="Upload Image"
          >
            <PhotoIcon />
            Upload
          </button>
          <button
            onClick={() => {
              if (draft) {
                const updatedDraft = {
                  ...draft,
                  lastModified: new Date().toISOString()
                };
                handleSave(updatedDraft);
              }
            }}
            className="action-button save-button"
            title="Save Draft"
            disabled={isPublishing || !isConnected}
          >
            {isPublishing ? 'Saving...' : !isConnected ? 'Connecting...' : 'Save'}
          </button>
          <button 
            onClick={handlePublish} 
            className="action-button publish-button"
            title="Publish to Nostr"
            disabled={isPublishing || !isConnected}
          >
            <ArrowUpTrayIcon />
            {isPublishing ? 'Publishing...' : !isConnected ? 'Connecting...' : 'Publish'}
          </button>
        </div>
      </div>
    </main>
  );
} 