'use client';

import { useEffect, useState, useRef } from 'react';
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
  dTag?: string; // Store the 'd' tag value for tracking relationships
}

export default function DraftList() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const eventsRef = useRef<NDKEvent[]>([]);
  const router = useRouter();
  const { ndk, isAuthenticated } = useNostr();

  useEffect(() => {
    const loadNostrDrafts = async () => {
      setIsLoading(true);
      eventsRef.current = []; // Reset events
      
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
        
        // Subscribe to draft events
        const subscription = ndk.subscribe(
          { 
            kinds: [30024 as NDKKind], // Draft events only
            authors: [pubkey] 
          },
          { closeOnEose: true },
          {
            onEvent: (event) => {
              // Just collect all events
              eventsRef.current.push(event);
            }
          }
        );

        // Set a timeout to process all events after they're received
        setTimeout(() => {
          console.log('DraftList: Processing all events:', eventsRef.current.length);
          
          // Convert events to drafts and remove duplicates by ID
          const uniqueEvents = eventsRef.current.filter((event, index, self) => 
            index === self.findIndex(e => e.id === event.id)
          );
          
          const allDrafts: Draft[] = uniqueEvents.map(event => {
            const title = event.tags.find((tag: string[]) => tag[0] === 'title')?.[1] || 'Untitled';
            const dTag = event.tags.find((tag: string[]) => tag[0] === 'd')?.[1];
            return {
              id: event.id,
              title,
              content: event.content,
              lastModified: new Date(event.created_at * 1000).toISOString(),
              dTag
            };
          });
          
          console.log('DraftList: All drafts before cleanup:', allDrafts.map(d => ({ id: d.id, title: d.title, dTag: d.dTag })));
          
          // Clean up: keep only the latest version of each draft
          const finalDrafts = allDrafts.filter(draft => {
            // If this draft is referenced by any other draft, it's an older version
            const isReferenced = allDrafts.some(otherDraft => 
              otherDraft.dTag === draft.id
            );
            if (isReferenced) {
              console.log('DraftList: Removing older draft', draft.id, 'referenced by newer draft');
            }
            return !isReferenced;
          });
          
          console.log('DraftList: Final drafts after cleanup:', finalDrafts.map(d => ({ id: d.id, title: d.title, dTag: d.dTag })));
          
          setDrafts(finalDrafts);
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
                  </div>
                  <div className="draft-date">
                    Last modified: {new Date(draft.lastModified).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
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