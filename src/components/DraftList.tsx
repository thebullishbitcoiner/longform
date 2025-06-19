'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { NDKKind, NDKEvent } from '@nostr-dev-kit/ndk';
import './DraftList.css';
import { toast } from 'react-hot-toast';

interface Draft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
  sources: Array<'local' | 'nostr'>;
}

export default function DraftList() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { ndk, isAuthenticated } = useNostr();

  useEffect(() => {
    const loadNostrDrafts = async () => {
      setIsLoading(true);
      
      if (!ndk || !isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        const nostr = window.nostr;
        if (!nostr) {
          setIsLoading(false);
          return;
        }
        
        const pubkey = await nostr.getPublicKey();
        
        const subscription = ndk.subscribe(
          { kinds: [30024 as NDKKind], authors: [pubkey] },
          { closeOnEose: true },
          {
            onEvent: (event) => {
              const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
              const draft: Draft = {
                id: event.id,
                title,
                content: event.content,
                lastModified: new Date(event.created_at * 1000).toISOString(),
                sources: ['nostr'] as const
              };
              setDrafts(prev => {
                // Check if we already have this draft
                const existingDraft = prev.find(d => d.id === draft.id);
                if (existingDraft) {
                  return prev.map(d => d.id === draft.id ? draft : d);
                }
                return [...prev, draft];
              });
            }
          }
        );

        // Set a timeout to stop loading if no events are received
        setTimeout(() => {
          setIsLoading(false);
        }, 5000);

        return () => {
          subscription.stop();
        };
      } catch (error) {
        console.error('DraftList: Error loading Nostr drafts:', error);
        setIsLoading(false);
      }
    };

    loadNostrDrafts();
  }, [ndk, isAuthenticated]);

  const handleCreateDraft = async () => {
    if (!ndk || !isAuthenticated) {
      toast.error('Please log in to create drafts.');
      return;
    }

    try {
      // Create a temporary local draft with a unique ID
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Navigate to the editor with the temporary ID
      router.push(`/editor/${tempId}`);
    } catch (error) {
      console.error('DraftList: Error creating new draft:', error);
      toast.error('Failed to create new draft. Please try again.');
    }
  };

  const handleDeleteDraft = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      if (!ndk || !isAuthenticated) {
        toast.error('Please log in to delete drafts.');
        return;
      }

      try {
        const nostr = window.nostr;
        if (!nostr) {
          toast.error('Nostr extension not found.');
          return;
        }

        // Create a deletion event (kind 5)
        const deleteEvent = new NDKEvent(ndk);
        deleteEvent.kind = 5; // Deletion event
        deleteEvent.content = 'Deleted draft'; // Optional reason
        deleteEvent.tags = [
          ['e', id] // Reference to the event being deleted
        ];
        deleteEvent.created_at = Math.floor(Date.now() / 1000);

        // Publish the deletion event
        await deleteEvent.publish();
        
        // Remove from local state
        setDrafts(drafts.filter(draft => draft.id !== id));
        
        toast.success('Draft deleted from Nostr');
      } catch (error) {
        console.error('DraftList: Error deleting draft:', error);
        toast.error('Failed to delete draft. Please try again.');
      }
    }
  };

  return (
    <>
      <div className="action-bar">
        <div className="draft-count">
          {isLoading ? 'Loading drafts...' : `${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}`}
        </div>
        <button onClick={handleCreateDraft} className="new-draft-button" disabled={isLoading}>
          <PlusIcon />
          New Draft
        </button>
      </div>

      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading drafts from Nostr...</p>
        </div>
      ) : (
        <div className="draft-list">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="draft-item"
              onClick={() => router.push(`/editor/${draft.id}`)}
            >
              <div className="draft-content">
                <div className="draft-info">
                  <div className="draft-title">
                    {draft.title}
                    {(draft.sources || ['local']).map(source => (
                      <span key={source} className={`draft-source ${source}`}>
                        {source === 'nostr' ? 'Nostr' : 'Local'}
                      </span>
                    ))}
                  </div>
                  <div className="draft-date">
                    Last Modified: {new Date(draft.lastModified).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteDraft(draft.id, draft.title, e)}
                  className="delete-button"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
} 