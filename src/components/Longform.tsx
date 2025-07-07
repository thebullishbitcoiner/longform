'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { NDKKind, NDKEvent } from '@nostr-dev-kit/ndk';
import { hexToNote1, generateNip05Url, getUserIdentifier, getCurrentUserIdentifier } from '@/utils/nostr';
import { copyToClipboard } from '@/utils/clipboard';
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
  pubkey: string; // Add pubkey for generating NIP-05 URLs
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
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; noteId: string | null }>({
    visible: false,
    x: 0,
    y: 0,
    noteId: null
  });
  const [jsonModal, setJsonModal] = useState<{ visible: boolean; data: Record<string, unknown> | null }>({
    visible: false,
    data: null
  });
  const [copyModal, setCopyModal] = useState<{ visible: boolean; text: string; title: string }>({
    visible: false,
    text: '',
    title: ''
  });
  const eventsRef = useRef<NDKEvent[]>([]);
  const publishedEventsRef = useRef<NDKEvent[]>([]);
  const deletionEventsRef = useRef<NDKEvent[]>([]); // Add reference for deletion events
  const router = useRouter();
  const { ndk, isAuthenticated, currentUser } = useNostr();

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
              pubkey: event.pubkey,
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

  const handleSharePublished = async (note: PublishedNote) => {
    try {
      // Use cached user profile for current user's posts, fetch for others
      const authorIdentifier = note.pubkey === currentUser?.pubkey 
        ? getCurrentUserIdentifier(currentUser)
        : await getUserIdentifier(ndk, note.pubkey);
      
      // Use the d tag from the note if available, otherwise fallback to event ID
      const dTag = note.dTag || note.id.slice(0, 8);
      
      const shareUrl = `${window.location.origin}${generateNip05Url(authorIdentifier, dTag)}`;
      
      await copyToClipboard(shareUrl);
      toast.success('Link copied to clipboard!');
    } catch {
      // Show manual copy modal for mobile or when clipboard fails
      try {
        const authorIdentifier = note.pubkey === currentUser?.pubkey 
          ? getCurrentUserIdentifier(currentUser)
          : await getUserIdentifier(ndk, note.pubkey);
        const dTag = note.dTag || note.id.slice(0, 8);
        const shareUrl = `${window.location.origin}${generateNip05Url(authorIdentifier, dTag)}`;
        setCopyModal({
          visible: true,
          text: shareUrl,
          title: 'Copy Link'
        });
      } catch {
        // If even the fallback fails, show a simple URL
        const simpleUrl = `${window.location.origin}/reader/${note.id}`;
        setCopyModal({
          visible: true,
          text: simpleUrl,
          title: 'Copy Link'
        });
      }
    }
  };

  const handleCopyNoteId = async (note: PublishedNote) => {
    try {
      // Convert hex event ID to note1 format according to NIP-19
      const note1 = hexToNote1(note.id);
      const textToCopy = note1 || note.id;
      
      await copyToClipboard(textToCopy);
      toast.success('Note ID copied to clipboard!');
    } catch {
      // Show manual copy modal for mobile or when clipboard fails
      const textToCopy = hexToNote1(note.id) || note.id;
      setCopyModal({
        visible: true,
        text: textToCopy,
        title: 'Copy Note ID'
      });
    }
  };

  const handleViewJson = (note: PublishedNote) => {
    // Find the original event data
    const originalEvent = publishedEventsRef.current.find(event => event.id === note.id);
    if (originalEvent) {
      setJsonModal({
        visible: true,
        data: {
          id: originalEvent.id,
          pubkey: originalEvent.pubkey,
          created_at: originalEvent.created_at,
          kind: originalEvent.kind,
          tags: originalEvent.tags,
          content: originalEvent.content,
          sig: originalEvent.sig
        }
      });
    }
    setContextMenu({ visible: false, x: 0, y: 0, noteId: null });
  };

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Estimate menu dimensions
    const estimatedMenuWidth = 160;
    const estimatedMenuHeight = 150;
    
    // Get the button element to position menu relative to it
    const buttonElement = e.currentTarget as HTMLElement;
    const buttonRect = buttonElement.getBoundingClientRect();
    
    // Position menu below the button
    let x = buttonRect.left;
    let y = buttonRect.bottom + 5; // 5px gap below button
    
    // Adjust horizontal position if menu would go off-screen
    if (x + estimatedMenuWidth > viewportWidth) {
      x = viewportWidth - estimatedMenuWidth - 10; // 10px margin from right edge
    }
    
    // If menu would go below viewport, position it above the button instead
    if (y + estimatedMenuHeight > viewportHeight) {
      y = buttonRect.top - estimatedMenuHeight - 5; // 5px gap above button
    }
    
    // Ensure minimum position
    x = Math.max(10, x);
    y = Math.max(10, y);
    
    setContextMenu({
      visible: true,
      x,
      y,
      noteId
    });
  };

  const handleContextMenuAction = (action: 'share' | 'json' | 'copyId') => {
    const note = publishedNotes.find(n => n.id === contextMenu.noteId);
    if (!note) return;

    if (action === 'share') {
      handleSharePublished(note);
    } else if (action === 'json') {
      handleViewJson(note);
    } else if (action === 'copyId') {
      handleCopyNoteId(note);
    }
    
    setContextMenu({ visible: false, x: 0, y: 0, noteId: null });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, noteId: null });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

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
                    onClick={(e) => handleContextMenu(e, note.id)}
                    className="menu-button"
                    title="More options"
                  >
                    <EllipsisHorizontalIcon />
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

      {/* Context Menu */}
      {contextMenu.visible && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000
          }}
        >
          <button 
            className="context-menu-item"
            onClick={() => handleContextMenuAction('share')}
          >
            Share
          </button>
          <button 
            className="context-menu-item"
            onClick={() => handleContextMenuAction('json')}
          >
            View JSON
          </button>
          <button 
            className="context-menu-item"
            onClick={() => handleContextMenuAction('copyId')}
          >
            Copy Note ID
          </button>
        </div>
      )}

      {/* JSON Modal */}
      {jsonModal.visible && (
        <div className="modal-overlay" onClick={() => setJsonModal({ visible: false, data: null })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Raw Event Data</h3>
              <button 
                className="modal-close"
                onClick={() => setJsonModal({ visible: false, data: null })}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <pre className="json-display">
                {JSON.stringify(jsonModal.data, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Copy Modal */}
      {copyModal.visible && (
        <div className="modal-overlay" onClick={() => setCopyModal({ visible: false, text: '', title: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{copyModal.title}</h3>
              <button 
                className="modal-close"
                onClick={() => setCopyModal({ visible: false, text: '', title: '' })}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="copy-url-container">
                <input
                  type="text"
                  value={copyModal.text}
                  readOnly
                  className="copy-url-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  className="copy-url-button"
                  onClick={() => {
                    navigator.clipboard?.writeText(copyModal.text).then(() => {
                      toast.success('Copied to clipboard!');
                    }).catch(() => {
                      toast.error('Failed to copy');
                    });
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 