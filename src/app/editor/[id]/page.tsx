'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { getDraft, updateDraft, Draft } from '@/utils/storage';
import { use } from 'react';
import Editor, { EditorRef } from '@/components/Editor';
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrSigner } from '@nostrify/types';
import { useNostr } from '@/contexts/NostrContext';
import toast from 'react-hot-toast';
import './page.css';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { id } = use(params);
  const { ndk, isConnected, isAuthenticated } = useNostr();
  const editorRef = useRef<EditorRef | null>(null);
  
  useEffect(() => {
    const loadDraft = async () => {
      console.log('Editor: Loading draft with ID:', id);
      setIsLoading(true);
      try {
        // Check if this is a temporary draft (new draft)
        if (id.startsWith('temp_')) {
          console.log('Editor: Creating new temporary draft');
          const tempDraft: Draft = {
            id: id,
            title: 'Untitled Draft',
            content: '',
            lastModified: new Date().toISOString(),
            sources: ['local']
          };
          console.log('Editor: Created temporary draft:', tempDraft);
          setDraft(tempDraft);
          setIsLoading(false);
          return;
        }

        // Load existing draft from Nostr
        if (ndk && isAuthenticated) {
          try {
            const nostr = window.nostr;
            if (!nostr) {
              console.log('Editor: No Nostr extension found');
              router.push('/');
              return;
            }

            const pubkey = await nostr.getPublicKey();
            console.log('Editor: User pubkey:', pubkey);
            
            // Query the specific event from Nostr
            console.log('Editor: Querying event from Nostr...');
            const event = await ndk.fetchEvent({ 
              ids: [id],
              kinds: [30024 as NDKKind],
              authors: [pubkey]
            });

            if (event) {
              console.log('Editor: Found event:', event);
              const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
              const nostrDraft: Draft = {
                id: event.id,
                title,
                content: event.content,
                lastModified: new Date(event.created_at * 1000).toISOString(),
                sources: ['nostr']
              };
              console.log('Editor: Created draft object:', nostrDraft);
              setDraft(nostrDraft);
            } else {
              console.log('Editor: Event not found');
              router.push('/');
            }
          } catch (error) {
            console.error('Editor: Error loading Nostr draft:', error);
            router.push('/');
          }
        } else {
          console.log('Editor: Not authenticated or NDK not available');
          router.push('/');
        }
      } catch (error) {
        console.error('Editor: Error loading draft:', error);
        router.push('/');
      } finally {
        setIsLoading(false);
      }
    };

    loadDraft();
  }, [id, router, ndk, isAuthenticated]);

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
    // For temporary drafts, we don't save to Nostr until the save button is clicked
  };

  const handleSave = async (updatedDraft: Draft) => {
    // Check if this is a temporary draft
    const isTemporaryDraft = updatedDraft.id.startsWith('temp_');
    
    if (isTemporaryDraft) {
      if (!ndk || !isAuthenticated) {
        toast.error('Please log in to save drafts.');
        return;
      }

      try {
        setIsPublishing(true);

        // Check if we have any connected relays
        const connectedRelays = ndk.pool.connectedRelays();
        if (connectedRelays.length === 0) {
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

        // Try to publish with a timeout
        const publishPromise = ndkEvent.publish();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Publishing timed out')), 10000)
        );

        await Promise.race([publishPromise, timeoutPromise]);
        
        // Update the draft with the new Nostr ID and sources
        const savedDraft: Draft = {
          ...updatedDraft,
          id: ndkEvent.id,
          sources: ['nostr']
        };
        setDraft(savedDraft);
        
        // Update the URL to reflect the new Nostr event ID
        router.replace(`/editor/${ndkEvent.id}`);
        
        toast.success('Draft saved to Nostr!');
      } catch (error: unknown) {
        console.error('Editor: Error saving temporary draft to Nostr:', error);
        if (error instanceof Error) {
          if (error.message?.includes('timed out')) {
            toast.error('Relay connection timed out. Please try again.');
          } else if (error.message?.includes('Not enough relays')) {
            toast.error('Could not connect to any relays. Please check your connection.');
          } else {
            toast.error('Failed to save to Nostr.');
          }
        } else {
          toast.error('Failed to save to Nostr.');
        }
      } finally {
        setIsPublishing(false);
      }
    } else {
      // Update existing Nostr draft
      if (!ndk || !isAuthenticated) {
        toast.error('Please log in to save drafts.');
        return;
      }

      try {
        setIsPublishing(true);

        // Check if we have any connected relays
        const connectedRelays = ndk.pool.connectedRelays();
        if (connectedRelays.length === 0) {
          toast.error('No connected relays. Please check your connection.');
          return;
        }

        // Create and publish the updated event
        const ndkEvent = new NDKEvent(ndk);
        ndkEvent.kind = 30024;
        ndkEvent.content = updatedDraft.content;
        ndkEvent.tags = [
          ['title', updatedDraft.title],
          ['published_at', Math.floor(Date.now() / 1000).toString()],
          ['t', 'longform']
        ];
        ndkEvent.created_at = Math.floor(Date.now() / 1000);

        // Try to publish with a timeout
        const publishPromise = ndkEvent.publish();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Publishing timed out')), 10000)
        );

        await Promise.race([publishPromise, timeoutPromise]);
        toast.success('Draft updated on Nostr!');
      } catch (error: unknown) {
        console.error('Editor: Error updating Nostr draft:', error);
        if (error instanceof Error) {
          if (error.message?.includes('timed out')) {
            toast.error('Relay connection timed out. Please try again.');
          } else if (error.message?.includes('Not enough relays')) {
            toast.error('Could not connect to any relays. Please check your connection.');
          } else {
            toast.error('Failed to update on Nostr.');
          }
        } else {
          toast.error('Failed to update on Nostr.');
        }
      } finally {
        setIsPublishing(false);
      }
    }
  };

  const handleImageUpload = async () => {
    if (!draft) return;

    if (!isAuthenticated) {
      alert('Please log in to upload images.');
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
        console.log('Editor: Uploading image:', file.name);
        const [[, url]] = await uploader.upload(file);
        console.log('Editor: Image uploaded to:', url);
        
        // Insert the image markdown at the cursor position
        const imageMarkdown = `![${file.name}](${url})`;
        const updatedDraft = {
          ...draft,
          content: draft.content + '\n' + imageMarkdown + '\n',
          lastModified: new Date().toISOString(),
        };
        setDraft(updatedDraft);
        handleSave(updatedDraft);
      } catch (error) {
        console.error('Editor: Error uploading image:', error);
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

  if (isLoading) {
    return (
      <main className="container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading draft...</p>
        </div>
      </main>
    );
  }

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
      <Editor draft={draft} onSave={handleSave} ref={editorRef} />
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
              if (editorRef.current) {
                editorRef.current.save();
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