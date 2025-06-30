'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { NDKKind, NDKEvent } from '@nostr-dev-kit/ndk';
import './Longform.css';
import { toast } from 'react-hot-toast';

interface Draft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
  dTag?: string; // Store the 'd' tag value for tracking relationships
}

interface PublishedNote {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  summary?: string;
  dTag?: string; // Store the 'd' tag value for tracking relationships
  createdAt: string; // Add created_at for versioning
}

export default function Longform() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [publishedNotes, setPublishedNotes] = useState<PublishedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPublished, setIsLoadingPublished] = useState(true);
  const eventsRef = useRef<NDKEvent[]>([]);
  const publishedEventsRef = useRef<NDKEvent[]>([]);
  const deletionEventsRef = useRef<NDKEvent[]>([]); // Add reference for deletion events
  const router = useRouter();
  const { ndk, isAuthenticated } = useNostr();

  useEffect(() => {
    const loadNostrContent = async () => {
      setIsLoading(true);
      setIsLoadingPublished(true);
      eventsRef.current = []; // Reset events
      publishedEventsRef.current = []; // Reset published events
      deletionEventsRef.current = []; // Reset deletion events
      
      if (!ndk || !isAuthenticated) {
        setIsLoading(false);
        setIsLoadingPublished(false);
        return;
      }

      try {
        const nostr = window.nostr;
        if (!nostr) {
          setIsLoading(false);
          setIsLoadingPublished(false);
          return;
        }
        
        const pubkey = await nostr.getPublicKey();
        
        // Subscribe to draft events (kind 30024)
        const draftSubscription = ndk.subscribe(
          { 
            kinds: [30024 as NDKKind], // Draft events only
            authors: [pubkey] 
          },
          { closeOnEose: true },
          {
            onEvent: (event) => {
              eventsRef.current.push(event);
            }
          }
        );

        // Subscribe to deletion events (kind 5)
        const deletionSubscription = ndk.subscribe(
          { 
            kinds: [5 as NDKKind], // Deletion events
            authors: [pubkey] 
          },
          { closeOnEose: true },
          {
            onEvent: (event) => {
              deletionEventsRef.current.push(event);
            }
          }
        );

        // Subscribe to published longform events (kind 30023)
        const publishedSubscription = ndk.subscribe(
          { 
            kinds: [30023 as NDKKind], // Published longform events
            authors: [pubkey] 
          },
          { closeOnEose: true },
          {
            onEvent: (event) => {
              publishedEventsRef.current.push(event);
            }
          }
        );

        // Set a timeout to process all events after they're received
        setTimeout(() => {
          console.log('Longform: Processing draft events:', eventsRef.current.length);
          console.log('Longform: Processing deletion events:', deletionEventsRef.current.length);
          console.log('Longform: Processing published events:', publishedEventsRef.current.length);
          
          // Get all deleted event IDs from deletion events
          const deletedEventIds = new Set<string>();
          deletionEventsRef.current.forEach(deletionEvent => {
            deletionEvent.tags.forEach((tag: string[]) => {
              if (tag[0] === 'e') {
                deletedEventIds.add(tag[1]);
              }
            });
          });
          
          console.log('Longform: Deleted event IDs:', Array.from(deletedEventIds));
          
          // Process drafts - filter out deleted ones
          const uniqueDraftEvents = eventsRef.current.filter((event, index, self) => 
            index === self.findIndex(e => e.id === event.id)
          );
          
          // Filter out drafts that have been deleted
          const nonDeletedDraftEvents = uniqueDraftEvents.filter(event => {
            const isDeleted = deletedEventIds.has(event.id);
            if (isDeleted) {
              const title = event.tags.find((tag: string[]) => tag[0] === 'title')?.[1] || 'Untitled';
              console.log('Longform: Removing deleted draft:', event.id, 'with title:', title);
            }
            return !isDeleted;
          });
          
          console.log('Longform: Draft events after filtering deletions:', nonDeletedDraftEvents.length);
          
          const allDrafts: Draft[] = nonDeletedDraftEvents.map(event => {
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
          
          console.log('Longform: All drafts before cleanup:', allDrafts.map(d => ({ id: d.id, title: d.title, dTag: d.dTag })));
          
          // Clean up: keep only the latest version of each draft
          const finalDrafts = allDrafts.filter(draft => {
            // If this draft is referenced by any other draft, it's an older version
            const isReferenced = allDrafts.some(otherDraft => 
              otherDraft.dTag === draft.id
            );
            if (isReferenced) {
              console.log('Longform: Removing older draft', draft.id, 'referenced by newer draft');
            }
            return !isReferenced;
          });
          
          console.log('Longform: Final drafts after cleanup:', finalDrafts.map(d => ({ id: d.id, title: d.title, dTag: d.dTag })));
          
          setDrafts(finalDrafts);
          setIsLoading(false);

          // Process published notes - also filter out deleted ones
          const uniquePublishedEvents = publishedEventsRef.current.filter((event, index, self) => 
            index === self.findIndex(e => e.id === event.id)
          );
          
          // Filter out published notes that have been deleted
          const nonDeletedPublishedEvents = uniquePublishedEvents.filter(event => {
            const isDeleted = deletedEventIds.has(event.id);
            if (isDeleted) {
              const title = event.tags.find((tag: string[]) => tag[0] === 'title')?.[1] || 'Untitled';
              console.log('Longform: Removing deleted published note:', event.id, 'with title:', title);
            }
            return !isDeleted;
          });
          
          console.log('Longform: Published events after filtering deletions:', nonDeletedPublishedEvents.length);
          
          const allPublishedNotes: PublishedNote[] = nonDeletedPublishedEvents.map(event => {
            const title = event.tags.find((tag: string[]) => tag[0] === 'title')?.[1] || 'Untitled';
            const publishedAtRaw = event.tags.find((tag: string[]) => tag[0] === 'published_at')?.[1] || event.created_at.toString();
            const summary = event.content.length > 200 ? event.content.substring(0, 200) + '...' : event.content;
            
            // Handle both seconds and milliseconds timestamps
            let publishedAtTimestamp: number;
            const publishedAtNum = parseInt(publishedAtRaw);
            
            // Unix timestamps: seconds are 10 digits, milliseconds are 13 digits
            // Check the length of the original string to determine format
            if (publishedAtRaw.length >= 13) {
              publishedAtTimestamp = publishedAtNum; // Already in milliseconds
            } else {
              publishedAtTimestamp = publishedAtNum * 1000; // Convert seconds to milliseconds
            }
            
            const dTag = event.tags.find((tag: string[]) => tag[0] === 'd')?.[1];
            
            return {
              id: event.id,
              title,
              content: event.content,
              publishedAt: new Date(publishedAtTimestamp).toISOString(),
              summary,
              dTag,
              createdAt: new Date(event.created_at * 1000).toISOString() // Add created_at for versioning
            };
          });
          
          console.log('Longform: All published notes before cleanup:', allPublishedNotes.map(n => ({ id: n.id, title: n.title, publishedAt: n.publishedAt, dTag: n.dTag })));
          
          // Clean up: keep only the latest version of each published note
          // Use "d" tag to group related posts, with fallback strategies for edge cases
          const finalPublishedNotes = allPublishedNotes.filter(note => {
            // Strategy 1: Group by "d" tag (primary method)
            if (note.dTag) {
              const notesWithSameDTag = allPublishedNotes.filter(otherNote => 
                otherNote.dTag === note.dTag
              );
              
              if (notesWithSameDTag.length > 1) {
                const mostRecentNote = notesWithSameDTag.reduce((latest, current) => 
                  new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
                );
                
                if (mostRecentNote.id !== note.id) {
                  console.log('Longform: Removing older published note', note.id, 'keeping newer version', mostRecentNote.id, 'with d tag', note.dTag);
                  return false;
                }
              }
            }
            
            // Strategy 2: Check for posts with same title but different d tags (edge case handling)
            const notesWithSameTitle = allPublishedNotes.filter(otherNote => 
              otherNote.title === note.title
            );
            
            if (notesWithSameTitle.length > 1) {
              // If there are multiple posts with the same title, check if any have d tags
              const notesWithDTags = notesWithSameTitle.filter(n => n.dTag);
              const notesWithoutDTags = notesWithSameTitle.filter(n => !n.dTag);
              
              if (notesWithDTags.length > 0) {
                // If some posts have d tags, prefer the most recent one with a d tag
                const mostRecentWithDTag = notesWithDTags.reduce((latest, current) => 
                  new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
                );
                
                if (mostRecentWithDTag.id !== note.id) {
                  console.log('Longform: Removing note with same title but different d tag', note.id, 'keeping version with d tag', mostRecentWithDTag.id);
                  return false;
                }
              } else if (notesWithoutDTags.length > 1) {
                // If no posts have d tags, keep the most recent one
                const mostRecentNote = notesWithoutDTags.reduce((latest, current) => 
                  new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
                );
                
                if (mostRecentNote.id !== note.id) {
                  console.log('Longform: Removing older published note with same title', note.id, 'keeping newer version', mostRecentNote.id);
                  return false;
                }
              }
            }
            
            return true;
          });
          
          console.log('Longform: Final published notes after cleanup:', finalPublishedNotes.map(n => ({ id: n.id, title: n.title, publishedAt: n.publishedAt, dTag: n.dTag })));
          
          // Sort published notes by published date (newest first)
          const sortedPublishedNotes = finalPublishedNotes.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          console.log('Longform: Published notes:', sortedPublishedNotes.map(n => ({ id: n.id, title: n.title })));
          
          setPublishedNotes(sortedPublishedNotes);
          setIsLoadingPublished(false);
        }, 5000);

        return () => {
          draftSubscription.stop();
          publishedSubscription.stop();
          deletionSubscription.stop();
        };
      } catch (error) {
        console.error('Longform: Error loading Nostr content:', error);
        setIsLoading(false);
        setIsLoadingPublished(false);
      }
    };

    loadNostrContent();
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
      console.error('Longform: Error creating new draft:', error);
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
        console.error('Longform: Error deleting draft:', error);
        toast.error('Failed to delete draft. Please try again.');
      }
    }
  };

  const handleViewPublished = (id: string) => {
    router.push(`/editor/${id}`);
  };

  const handleSharePublished = async (e: React.MouseEvent, note: PublishedNote) => {
    e.preventDefault();
    e.stopPropagation();
    
    const shareUrl = `${window.location.origin}/reader/${note.id}`;
    
    try {
      if (navigator.share) {
        // Use native sharing if available
        await navigator.share({
          title: note.title,
          text: note.summary || note.title,
          url: shareUrl,
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      // Fallback to clipboard if sharing fails
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied to clipboard!');
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
        toast.error('Failed to copy link');
      }
    }
  };

  return (
    <>
      <div className="action-bar">
      </div>

      {/* Drafts Section */}
      <div className="content-section">
        <div className="section-header">
          <h2 className="section-title">Drafts ({drafts.length})</h2>
          <button onClick={handleCreateDraft} className="new-draft-button" disabled={isLoading}>
            <PlusIcon />
          </button>
        </div>
        {isLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
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
                      Last modified: {new Date(draft.lastModified).toLocaleDateString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        year: '2-digit'
                      })} {new Date(draft.lastModified).toLocaleTimeString('en-US', {
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
            {drafts.length === 0 && !isLoading && (
              <div className="empty-state">
                <p>No drafts yet. Click the + button to create your first draft.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Published Section */}
      <div className="content-section">
        <div className="section-header">
          <h2 className="section-title">Published ({publishedNotes.length})</h2>
        </div>
        {isLoadingPublished ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
          </div>
        ) : (
          <div className="published-list">
            {publishedNotes.map((note) => (
              <div
                key={note.id}
                className="published-item"
                onClick={() => handleViewPublished(note.id)}
              >
                <div className="published-content">
                  <div className="published-info">
                    <div className="published-title">
                      {note.title}
                    </div>
                    <div className="published-dates">
                      <div className="last-modified-date">
                        Last Modified: {new Date(note.createdAt).toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit'
                        })} {new Date(note.createdAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="published-date-info">
                        Published: {new Date(note.publishedAt).toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit'
                        })} {new Date(note.publishedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleSharePublished(e, note)}
                    className="share-button"
                    title="Share post"
                  >
                    <ShareIcon />
                  </button>
                </div>
              </div>
            ))}
            {publishedNotes.length === 0 && !isLoadingPublished && (
              <div className="empty-state">
                <p>No published notes yet. Create a draft and publish it to see it here.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
} 