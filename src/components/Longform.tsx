'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { NDKKind, NDKEvent } from '@nostr-dev-kit/ndk';
import { hexToNote1, generateNip05Url, getUserIdentifier, getCurrentUserIdentifier } from '@/utils/nostr';
import { copyToClipboard } from '@/utils/clipboard';
import './Longform.css';
import { toast } from 'react-hot-toast';
import JsonModal from './JsonModal';



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
  const [loadError, setLoadError] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; noteId: string | null }>({
    visible: false,
    x: 0,
    y: 0,
    noteId: null
  });
  const [draftContextMenu, setDraftContextMenu] = useState<{ visible: boolean; x: number; y: number; draftId: string | null }>({
    visible: false,
    x: 0,
    y: 0,
    draftId: null
  });
  const [jsonModal, setJsonModal] = useState<{
    isOpen: boolean;
    data: unknown;
  }>({
    isOpen: false,
    data: null
  });
  const [shareModal, setShareModal] = useState<{ visible: boolean; text: string; title: string }>({
    visible: false,
    text: '',
    title: ''
  });
  const eventsRef = useRef<NDKEvent[]>([]);
  const publishedEventsRef = useRef<NDKEvent[]>([]);
  const deletionEventsRef = useRef<NDKEvent[]>([]); // Add reference for deletion events
  const router = useRouter();
  const { ndk, isAuthenticated, currentUser } = useNostr();



  const retryLoad = () => {
    setLoadError(null);
    setIsLoading(true);
    setIsLoadingPublished(true);
    eventsRef.current = [];
    publishedEventsRef.current = [];
    deletionEventsRef.current = [];
    // The useEffect will automatically retry since we changed the loading states
  };



  useEffect(() => {
    const loadNostrContent = async () => {
      setIsLoading(true);
      setIsLoadingPublished(true);
      eventsRef.current = []; // Reset events
      publishedEventsRef.current = []; // Reset published events
      deletionEventsRef.current = []; // Reset deletion events
      
      if (!ndk || !isAuthenticated) {
        console.log('Longform: NDK or authentication not ready, skipping load');
        setIsLoading(false);
        setIsLoadingPublished(false);
        return;
      }

      try {
        console.log('Longform: Attempting to load Nostr content...');

        // Use the current user's pubkey from context instead of calling window.nostr.getPublicKey()
        if (!currentUser?.pubkey) {
          console.error('Longform: No current user pubkey available');
          setIsLoading(false);
          setIsLoadingPublished(false);
          return;
        }
        
        const pubkey = currentUser.pubkey;
        console.log('Longform: Using pubkey from context:', pubkey);
        
        console.log('Longform: Setting up Nostr subscriptions...');
        
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
        console.log('Longform: Draft subscription active');

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
        console.log('Longform: Deletion subscription active');

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
        console.log('Longform: Published subscription active');

        // Set a timeout to process all events after they're received
        const timeoutDuration = 8000; // 8 seconds for all devices
        
        console.log(`Longform: Setting timeout for ${timeoutDuration}ms`);
        
        setTimeout(() => {
          console.log('Longform: Processing draft events:', eventsRef.current.length);
          
          // Get all deleted event IDs from deletion events
          const deletedEventIds = new Set<string>();
          deletionEventsRef.current.forEach(deletionEvent => {
            deletionEvent.tags.forEach((tag: string[]) => {
              if (tag[0] === 'e') {
                deletedEventIds.add(tag[1]);
              }
            });
          });
          
          console.log(`Longform: Deleted event IDs processed: ${Array.from(deletedEventIds).length}`);
          
          // Process drafts - filter out deleted ones
          const uniqueDraftEvents = eventsRef.current.filter((event, index, self) => 
            index === self.findIndex(e => e.id === event.id)
          );
          
          // Filter out drafts that have been deleted
          const nonDeletedDraftEvents = uniqueDraftEvents.filter(event => {
            const isDeleted = deletedEventIds.has(event.id);
            if (isDeleted) {
              const title = event.tags.find((tag: string[]) => tag[0] === 'title')?.[1] || 'Untitled';
              console.log(`Longform: Removing deleted draft: ${event.id} with title: ${title}`);
            }
            return !isDeleted;
          });
          
          console.log(`Longform: Draft events after filtering deletions: ${nonDeletedDraftEvents.length}`);
          
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
          
          console.log(`Longform: All drafts before cleanup: ${allDrafts.length}`);
          
          // Clean up: keep only the latest version of each draft
          const finalDrafts = allDrafts.filter(draft => {
            // If this draft is referenced by any other draft, it's an older version
            const isReferenced = allDrafts.some(otherDraft => 
              otherDraft.dTag === draft.id
            );
            if (isReferenced) {
              console.log(`Longform: Removing older draft ${draft.id} referenced by newer draft`);
            }
            return !isReferenced;
          });
          
          console.log(`Longform: Final drafts after cleanup: ${finalDrafts.length}`);
          
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
              console.log(`Longform: Removing deleted published note: ${event.id} with title: ${title}`);
            }
            return !isDeleted;
          });
          
          console.log(`Longform: Published events after filtering deletions: ${nonDeletedPublishedEvents.length}`);
          
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
          
          console.log(`Longform: All published notes before cleanup: ${allPublishedNotes.length}`);
          
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
                  console.log(`Longform: Removing older published note ${note.id} keeping newer version ${mostRecentNote.id} with d tag ${note.dTag}`);
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
                  console.log(`Longform: Removing note with same title but different d tag ${note.id} keeping version with d tag ${mostRecentWithDTag.id}`);
                  return false;
                }
              } else if (notesWithoutDTags.length > 1) {
                // If no posts have d tags, keep the most recent one
                const mostRecentNote = notesWithoutDTags.reduce((latest, current) => 
                  new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
                );
                
                if (mostRecentNote.id !== note.id) {
                  console.log(`Longform: Removing older published note with same title ${note.id} keeping newer version ${mostRecentNote.id}`);
                  return false;
                }
              }
            }
            
            return true;
          });
          
          console.log(`Longform: Final published notes after cleanup: ${finalPublishedNotes.length}`);
          
          // Sort published notes by published date (newest first)
          const sortedPublishedNotes = finalPublishedNotes.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          console.log(`Longform: Published notes: ${sortedPublishedNotes.length}`);
          
          setPublishedNotes(sortedPublishedNotes);
          setIsLoadingPublished(false);
          console.log(`Longform: Loading complete! Found ${finalDrafts.length} drafts and ${sortedPublishedNotes.length} published articles`);
        }, timeoutDuration);

        return () => {
          draftSubscription.stop();
          publishedSubscription.stop();
          deletionSubscription.stop();
        };
      } catch (error) {
        console.error('Longform: Error loading Nostr content:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setLoadError(errorMessage);
        setIsLoading(false);
        setIsLoadingPublished(false);
      }
    };

    loadNostrContent();
  }, [ndk, isAuthenticated, currentUser?.pubkey]);

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
        setShareModal({
          visible: true,
          text: shareUrl,
          title: 'Share this Article'
        });
      } catch {
        // If even the fallback fails, show a simple URL
        const simpleUrl = `${window.location.origin}/reader/${note.id}`;
        setShareModal({
          visible: true,
          text: simpleUrl,
          title: 'Copy Link'
        });
      }
    }
  };

  const handleCopyNoteId = async (note: PublishedNote) => {
    try {
      // Convert hex to note1 format
      const note1Id = hexToNote1(note.id);
      const textToCopy = note1Id || note.id; // Fallback to hex if conversion fails
      
      await navigator.clipboard.writeText(textToCopy);
      toast.success('Note ID copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy note ID:', error);
      toast.error('Failed to copy note ID');
    }
  };

  const handleViewJson = (note: PublishedNote) => {
    // Find the original event data
    const originalEvent = publishedEventsRef.current.find(event => event.id === note.id);
    if (originalEvent) {
      setJsonModal({
        isOpen: true,
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

  const handleDraftContextMenu = (e: React.MouseEvent, draftId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Estimate menu dimensions
    const estimatedMenuWidth = 150;
    const estimatedMenuHeight = 80;
    
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
    
    setDraftContextMenu({
      visible: true,
      x,
      y,
      draftId
    });
  };

  const handleDraftContextMenuAction = (action: 'json' | 'delete') => {
    const draft = drafts.find(d => d.id === draftContextMenu.draftId);
    if (!draft) return;

    if (action === 'json') {
      // Find the actual Nostr event for this draft
      const draftEvent = eventsRef.current.find(event => event.id === draft.id);
      if (draftEvent) {
        setJsonModal({
          isOpen: true,
          data: {
            id: draftEvent.id,
            pubkey: draftEvent.pubkey,
            created_at: draftEvent.created_at,
            kind: draftEvent.kind,
            tags: draftEvent.tags,
            content: draftEvent.content,
            sig: draftEvent.sig
          }
        });
      }
    } else if (action === 'delete') {
      handleDeleteDraft(draft.id, draft.title);
    }
    
    setDraftContextMenu({ visible: false, x: 0, y: 0, draftId: null });
  };

  // Close context menu when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, noteId: null });
      }
      if (draftContextMenu.visible) {
        setDraftContextMenu({ visible: false, x: 0, y: 0, draftId: null });
      }
    };

    const handleScroll = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, noteId: null });
      }
      if (draftContextMenu.visible) {
        setDraftContextMenu({ visible: false, x: 0, y: 0, draftId: null });
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [contextMenu.visible, draftContextMenu.visible]);

  // Prevent scrolling when modals are open
  useEffect(() => {
    const isModalOpen = jsonModal.isOpen || shareModal.visible;
    
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup function to restore scrolling when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [jsonModal.isOpen, shareModal.visible]);

  return (
    <>
      <div className="action-bar">
      </div>

      {/* Error Display */}
      {loadError && (
        <div className="error-container">
          <p className="error-message">Failed to load content: {loadError}</p>
          <button onClick={retryLoad} className="retry-button">
            Retry
          </button>
        </div>
      )}



      {/* Global Loading Spinner */}
      {(isLoading || isLoadingPublished) && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading kinds 30023 and 30024...</p>
        </div>
      )}

      {/* Drafts and Published Sections - only show when loading is complete */}
      {(!isLoading && !isLoadingPublished) && (
        <>
          {/* Drafts Section */}
          <div className="content-section">
            <div className="section-header">
              <h2 className="section-title">Drafts ({drafts.length})</h2>
              <button onClick={handleCreateDraft} className="new-draft-button" disabled={isLoading}>
                <PlusIcon />
              </button>
            </div>
            <div className="draft-list">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="draft-item"
                  onClick={() => router.push(`/editor/${draft.id}`)}
                >
                  <div className="draft-header">
                    <button
                      onClick={(e) => handleDraftContextMenu(e, draft.id)}
                      className="menu-button"
                      title="More options"
                    >
                      <EllipsisVerticalIcon />
                    </button>
                  </div>
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
                  </div>
                </div>
              ))}
              {drafts.length === 0 && (
                <div className="empty-state">
                  <p>No drafts yet. Click the + button to create your first draft.</p>
                </div>
              )}
            </div>
          </div>

          {/* Published Section */}
          <div className="content-section">
            <div className="section-header">
              <h2 className="section-title">Published ({publishedNotes.length})</h2>
            </div>
            <div className="published-list">
              {publishedNotes.map((note) => (
                <div
                  key={note.id}
                  className="published-item"
                  onClick={() => handleViewPublished(note.id)}
                >
                  <div className="published-header">
                    <button
                      onClick={(e) => handleContextMenu(e, note.id)}
                      className="menu-button"
                      title="More options"
                    >
                      <EllipsisVerticalIcon />
                    </button>
                  </div>
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
                  </div>
                </div>
              ))}
              {publishedNotes.length === 0 && (
                <div className="empty-state">
                  <p>No published notes yet. Create a draft and publish it to see it here.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

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

      {/* Draft Context Menu */}
      {draftContextMenu.visible && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            top: draftContextMenu.y,
            left: draftContextMenu.x,
            zIndex: 1000
          }}
        >
          <button 
            className="context-menu-item"
            onClick={() => handleDraftContextMenuAction('json')}
          >
            View JSON
          </button>
          <button 
            className="context-menu-item"
            onClick={() => handleDraftContextMenuAction('delete')}
          >
            Delete
          </button>
        </div>
      )}

      {/* JSON Modal */}
      <JsonModal
        isOpen={jsonModal.isOpen}
        onClose={() => setJsonModal({ isOpen: false, data: null })}
        data={jsonModal.data}
      />

      {/* Share Modal */}
      {shareModal.visible && (
        <div className="modal-overlay" onClick={() => setShareModal({ visible: false, text: '', title: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Share this Article</h3>
              <button 
                className="modal-close"
                onClick={() => setShareModal({ visible: false, text: '', title: '' })}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="copy-url-container">
                <textarea
                  value={shareModal.text}
                  readOnly
                  className="copy-url-input"
                  rows={3}
                  style={{ resize: 'none' }}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
                <button
                  className="copy-url-button"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareModal.text).then(() => {
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