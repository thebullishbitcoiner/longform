'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { Draft } from '@/utils/storage';
import { use } from 'react';
import Editor, { EditorRef } from '@/components/Editor';
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrSigner, NostrEvent } from '@nostrify/types';
import { useNostr } from '@/contexts/NostrContext';
import toast from 'react-hot-toast';
import './page.css';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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
            sources: ['local'],
            kind: 30024 // Temporary drafts are kind 30024
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
              kinds: [30024 as NDKKind, 30023 as NDKKind], // Query both drafts and published posts
              authors: [pubkey]
            });

            if (event) {
              console.log('Editor: Found event:', event);
              const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
              const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
              const coverImage = event.tags.find(tag => tag[0] === 'image')?.[1];
              const summary = event.tags.find(tag => tag[0] === 'summary')?.[1];
              const hashtags = event.tags
                .filter(tag => tag[0] === 't' && tag[1] !== 'longform')
                .map(tag => tag[1]);
              const nostrDraft: Draft = {
                id: event.id,
                title,
                content: event.content,
                lastModified: new Date(event.created_at * 1000).toISOString(),
                sources: ['nostr'],
                dTag,
                coverImage,
                summary,
                hashtags,
                originalTags: event.tags, // Store original tags for preserving metadata
                kind: event.kind // Store the event kind to determine if it's a draft or published post
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
      const signedEvent = await nostr.signEvent({
        ...event,
        pubkey,
        id: '', // This will be computed by the uploader
        sig: ''
      });
      return {
        ...event,
        pubkey,
        id: signedEvent.id || '', // This will be computed by the uploader
        sig: signedEvent.sig || ''
      } as NostrEvent;
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
    setHasUnsavedChanges(true);
    // For temporary drafts, we don't save to Nostr until the save button is clicked
  };

  const handleSummaryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!draft) return;
    const updatedDraft = {
      ...draft,
      summary: e.target.value,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
    // For temporary drafts, we don't save to Nostr until the save button is clicked
  };

  const [hashtagInput, setHashtagInput] = useState('');

  const handleHashtagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHashtagInput(value);
    
    // Check if the last character is a comma
    if (value.endsWith(',')) {
      const hashtag = value.slice(0, -1).trim(); // Remove comma and trim whitespace
      if (hashtag && draft && !draft.hashtags?.includes(hashtag)) {
        const updatedDraft = {
          ...draft,
          hashtags: [...(draft.hashtags || []), hashtag],
          lastModified: new Date().toISOString(),
        };
        setDraft(updatedDraft);
        setHashtagInput(''); // Clear the input
        setHasUnsavedChanges(true);
      } else {
        setHashtagInput(''); // Clear the input even if hashtag already exists
      }
    }
  };

  const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && hashtagInput.trim() && draft) {
      e.preventDefault();
      const hashtag = hashtagInput.trim();
      if (!draft.hashtags?.includes(hashtag)) {
        const updatedDraft = {
          ...draft,
          hashtags: [...(draft.hashtags || []), hashtag],
          lastModified: new Date().toISOString(),
        };
        setDraft(updatedDraft);
        setHashtagInput('');
        setHasUnsavedChanges(true);
      } else {
        setHashtagInput('');
      }
    }
  };

  const removeHashtag = (hashtagToRemove: string) => {
    if (!draft) return;
    const updatedDraft = {
      ...draft,
      hashtags: draft.hashtags?.filter(hashtag => hashtag !== hashtagToRemove) || [],
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
  };

  const handleSave = async (updatedDraft: Draft) => {
    // Only allow saving drafts (kind 30024), not published posts
    if (updatedDraft.kind !== 30024) {
      console.log('Editor: Cannot save published post as draft');
      return;
    }

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
        
        // Add hashtags as 't' tags
        if (updatedDraft.hashtags) {
          updatedDraft.hashtags.forEach(hashtag => {
            ndkEvent.tags.push(['t', hashtag]);
          });
        }
        
        // Add summary tag if present
        if (updatedDraft.summary) {
          ndkEvent.tags.push(['summary', updatedDraft.summary]);
        }
        
        // Add cover image tag if present
        if (updatedDraft.coverImage) {
          ndkEvent.tags.push(['image', updatedDraft.coverImage]);
        }
        
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
        setHasUnsavedChanges(false);
        
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

        // Check if this is an update to an already published post
        // If the current draft ID is from a kind 30023 event, use it as the "d" tag
        const isUpdatingPublishedPost = updatedDraft.sources?.includes('nostr') && !updatedDraft.id.startsWith('temp_');
        
        // Create and publish the event using NDK's methods
        const ndkEvent = new NDKEvent(ndk);
        ndkEvent.kind = 30024;
        ndkEvent.content = updatedDraft.content;
        
        console.log('Editor: Setting content for publish:', {
          draftContent: updatedDraft.content.substring(0, 100) + '...',
          contentLength: updatedDraft.content.length,
          isUpdatingPublishedPost
        });
        
        if (isUpdatingPublishedPost && updatedDraft.originalTags) {
          // Preserve all original metadata, updating only necessary fields
          const updatedTags = updatedDraft.originalTags.map(tag => {
            const [tagName] = tag;
            
            // Update title if it changed
            if (tagName === 'title') {
              return ['title', updatedDraft.title];
            }
            
            // Update summary if it changed
            if (tagName === 'summary') {
              return ['summary', updatedDraft.summary || ''];
            }
            
            // Preserve published_at - don't update it for existing posts
            // published_at should represent the original publication date
            if (tagName === 'published_at') {
              return tag; // Keep the original published_at value
            }
            
            // Preserve all other tags as-is
            return tag;
          });
          
          // Add the "d" tag to link to the original post
          const dTagValue = updatedDraft.dTag || updatedDraft.id;
          const hasDTag = updatedTags.some(tag => tag[0] === 'd');
          if (!hasDTag) {
            updatedTags.push(['d', dTagValue]);
          }
          
          // Remove existing hashtags (t tags except 'longform') and add new ones
          const filteredTags = updatedTags.filter(tag => !(tag[0] === 't' && tag[1] !== 'longform'));
          
          // Add hashtags as 't' tags
          if (updatedDraft.hashtags) {
            updatedDraft.hashtags.forEach(hashtag => {
              filteredTags.push(['t', hashtag]);
            });
          }
          
          // Add or update summary tag
          const hasSummaryTag = filteredTags.some(tag => tag[0] === 'summary');
          if (updatedDraft.summary) {
            if (hasSummaryTag) {
              // Update existing summary tag
              const summaryTagIndex = filteredTags.findIndex(tag => tag[0] === 'summary');
              filteredTags[summaryTagIndex] = ['summary', updatedDraft.summary];
            } else {
              // Add new summary tag
              filteredTags.push(['summary', updatedDraft.summary]);
            }
          }
          
          // Add or update cover image tag
          const hasImageTag = filteredTags.some(tag => tag[0] === 'image');
          if (updatedDraft.coverImage) {
            if (hasImageTag) {
              // Update existing image tag
              const imageTagIndex = filteredTags.findIndex(tag => tag[0] === 'image');
              filteredTags[imageTagIndex] = ['image', updatedDraft.coverImage];
            } else {
              // Add new image tag
              filteredTags.push(['image', updatedDraft.coverImage]);
            }
          }
          
          ndkEvent.tags = filteredTags;
        } else {
          // For new posts, use standard tags
          ndkEvent.tags = [
            ['title', updatedDraft.title],
            ['published_at', Math.floor(Date.now() / 1000).toString()],
            ['t', 'longform']
          ];
          
          // If updating a published post without original tags, add the "d" tag
          if (isUpdatingPublishedPost) {
            const dTagValue = updatedDraft.dTag || updatedDraft.id;
            ndkEvent.tags.push(['d', dTagValue]);
          }
          
          // Add hashtags as 't' tags
          if (updatedDraft.hashtags) {
            updatedDraft.hashtags.forEach(hashtag => {
              ndkEvent.tags.push(['t', hashtag]);
            });
          }
          
          // Add summary tag if present
          if (updatedDraft.summary) {
            ndkEvent.tags.push(['summary', updatedDraft.summary]);
          }
          
          // Add cover image tag if present
          if (updatedDraft.coverImage) {
            ndkEvent.tags.push(['image', updatedDraft.coverImage]);
          }
        }
        
        ndkEvent.created_at = Math.floor(Date.now() / 1000);

        console.log('Editor: Publishing article:', {
          kind: ndkEvent.kind,
          content: ndkEvent.content,
          contentLength: ndkEvent.content.length,
          draftContent: updatedDraft.content,
          draftContentLength: updatedDraft.content.length,
          currentContent: updatedDraft.content,
          currentContentLength: updatedDraft.content.length,
          tags: ndkEvent.tags,
          created_at: ndkEvent.created_at,
          isUpdatingPublishedPost,
          hasOriginalTags: !!updatedDraft.originalTags
        });

        await ndkEvent.publish();
        
        // Update the draft with the new Nostr ID and preserve the original tags
        const savedDraft: Draft = {
          ...updatedDraft,
          id: ndkEvent.id,
          content: updatedDraft.content, // Include the current content
          lastModified: new Date().toISOString(),
          sources: ['nostr'],
          originalTags: ndkEvent.tags, // Update with the new tags for future updates
          kind: 30024 // Drafts are kind 30024
        };
        setDraft(savedDraft);
        setHasUnsavedChanges(false);
        
        // Update the URL to reflect the new Nostr event ID
        router.replace(`/editor/${ndkEvent.id}`);
        
        toast.success('Published successfully!');
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
        setHasUnsavedChanges(true);
        // Don't automatically save - let the user decide when to save
      } catch (error) {
        console.error('Editor: Error uploading image:', error);
        alert('Failed to upload image. Please try again.');
      }
    };

    input.click();
  };

  const handleCoverImageUpload = async () => {
    if (!draft) return;

    if (!isAuthenticated) {
      toast.error('Please log in to upload cover images.');
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
        console.log('Editor: Uploading cover image:', file.name);
        const [[, url]] = await uploader.upload(file);
        console.log('Editor: Cover image uploaded to:', url);
        
        const updatedDraft = {
          ...draft,
          coverImage: url,
          lastModified: new Date().toISOString(),
        };
        setDraft(updatedDraft);
        setHasUnsavedChanges(true);
        // Don't automatically save - let the user decide when to save
        toast.success('Cover image uploaded successfully!');
      } catch (error) {
        console.error('Editor: Error uploading cover image:', error);
        toast.error('Failed to upload cover image. Please try again.');
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

      // First, get the latest content from the editor
      let currentContent = draft.content;
      if (editorRef.current) {
        // Get the current content directly from the editor
        currentContent = editorRef.current.getContent();
      }

      // Check if this is an update to an already published post
      // If the current draft ID is from a kind 30023 event, use it as the "d" tag
      const isUpdatingPublishedPost = draft.sources?.includes('nostr') && !draft.id.startsWith('temp_');
      
      // Create and publish the event using NDK's methods
      const ndkEvent = new NDKEvent(ndk);
      ndkEvent.kind = 30023;
      ndkEvent.content = currentContent;
      
      console.log('Editor: Setting content for publish:', {
        draftContent: currentContent.substring(0, 100) + '...',
        contentLength: currentContent.length,
        isUpdatingPublishedPost
      });
      
      if (isUpdatingPublishedPost && draft.originalTags) {
        // Preserve all original metadata, updating only necessary fields
        const updatedTags = draft.originalTags.map(tag => {
          const [tagName] = tag;
          
          // Update title if it changed
          if (tagName === 'title') {
            return ['title', draft.title];
          }
          
          // Update summary if it changed
          if (tagName === 'summary') {
            return ['summary', draft.summary || ''];
          }
          
          // Preserve published_at - don't update it for existing posts
          // published_at should represent the original publication date
          if (tagName === 'published_at') {
            return tag; // Keep the original published_at value
          }
          
          // Preserve all other tags as-is
          return tag;
        });
        
        // Add the "d" tag to link to the original post
        const dTagValue = draft.dTag || draft.id;
        const hasDTag = updatedTags.some(tag => tag[0] === 'd');
        if (!hasDTag) {
          updatedTags.push(['d', dTagValue]);
        }
        
        // Remove existing hashtags (t tags except 'longform') and add new ones
        const filteredTags = updatedTags.filter(tag => !(tag[0] === 't' && tag[1] !== 'longform'));
        
        // Add hashtags as 't' tags
        if (draft.hashtags) {
          draft.hashtags.forEach(hashtag => {
            filteredTags.push(['t', hashtag]);
          });
        }
        
        // Add or update summary tag
        const hasSummaryTag = filteredTags.some(tag => tag[0] === 'summary');
        if (draft.summary) {
          if (hasSummaryTag) {
            // Update existing summary tag
            const summaryTagIndex = filteredTags.findIndex(tag => tag[0] === 'summary');
            filteredTags[summaryTagIndex] = ['summary', draft.summary];
          } else {
            // Add new summary tag
            filteredTags.push(['summary', draft.summary]);
          }
        }
        
        // Add or update cover image tag
        const hasImageTag = filteredTags.some(tag => tag[0] === 'image');
        if (draft.coverImage) {
          if (hasImageTag) {
            // Update existing image tag
            const imageTagIndex = filteredTags.findIndex(tag => tag[0] === 'image');
            filteredTags[imageTagIndex] = ['image', draft.coverImage];
          } else {
            // Add new image tag
            filteredTags.push(['image', draft.coverImage]);
          }
        }
        
        ndkEvent.tags = filteredTags;
      } else if (isUpdatingPublishedPost) {
        // Updating a published post but no original tags available
        // We need to preserve the original published_at timestamp
        const originalPublishedAt = draft.originalTags?.find(tag => tag[0] === 'published_at')?.[1];
        
        ndkEvent.tags = [
          ['title', draft.title],
          ['published_at', originalPublishedAt || Math.floor(Date.now() / 1000).toString()],
          ['t', 'longform']
        ];
        
        // Add the "d" tag to link to the original post
        const dTagValue = draft.dTag || draft.id;
        ndkEvent.tags.push(['d', dTagValue]);
        
        // Add hashtags as 't' tags
        if (draft.hashtags) {
          draft.hashtags.forEach(hashtag => {
            ndkEvent.tags.push(['t', hashtag]);
          });
        }
        
        // Add summary tag if present
        if (draft.summary) {
          ndkEvent.tags.push(['summary', draft.summary]);
        }
        
        // Add cover image tag if present
        if (draft.coverImage) {
          ndkEvent.tags.push(['image', draft.coverImage]);
        }
      } else {
        // For new posts, use standard tags
        ndkEvent.tags = [
          ['title', draft.title],
          ['published_at', Math.floor(Date.now() / 1000).toString()],
          ['t', 'longform']
        ];
        
        // Add hashtags as 't' tags
        if (draft.hashtags) {
          draft.hashtags.forEach(hashtag => {
            ndkEvent.tags.push(['t', hashtag]);
          });
        }
        
        // Add summary tag if present
        if (draft.summary) {
          ndkEvent.tags.push(['summary', draft.summary]);
        }
        
        // Add cover image tag if present
        if (draft.coverImage) {
          ndkEvent.tags.push(['image', draft.coverImage]);
        }
      }
      
      ndkEvent.created_at = Math.floor(Date.now() / 1000);

      console.log('Editor: Publishing article:', {
        kind: ndkEvent.kind,
        content: ndkEvent.content,
        contentLength: ndkEvent.content.length,
        draftContent: draft.content,
        draftContentLength: draft.content.length,
        currentContent: currentContent,
        currentContentLength: currentContent.length,
        tags: ndkEvent.tags,
        created_at: ndkEvent.created_at,
        isUpdatingPublishedPost,
        hasOriginalTags: !!draft.originalTags
      });

      await ndkEvent.publish();
      
      // Update the draft with the new Nostr ID and preserve the original tags
      const savedDraft: Draft = {
        ...draft,
        id: ndkEvent.id,
        content: currentContent, // Include the current content
        lastModified: new Date().toISOString(),
        sources: ['nostr'],
        originalTags: ndkEvent.tags, // Update with the new tags for future updates
        kind: 30023 // Published posts are kind 30023
      };
      setDraft(savedDraft);
      setHasUnsavedChanges(false);
      
      // Update the URL to reflect the new Nostr event ID
      router.replace(`/editor/${ndkEvent.id}`);
      
      toast.success('Published successfully!');
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
          Back to Posts
        </button>
        
        {/* Page Title */}
        <h1 className="editor-title">
          {draft.kind === 30023 ? 'Edit Post' : 'Edit Draft'}
        </h1>
        
        {/* Cover Image Section */}
        <div className="cover-image-section">
          {draft.coverImage ? (
            <div className="cover-image-preview">
              <img 
                src={draft.coverImage} 
                alt="Cover" 
                className="cover-image"
                onError={(e) => {
                  console.error('Failed to load cover image:', draft.coverImage);
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="cover-image-overlay">
                <button 
                  onClick={handleCoverImageUpload}
                  className="cover-image-action"
                  title="Change Cover Image"
                >
                  <PhotoIcon />
                </button>
              </div>
            </div>
          ) : (
            <div className="cover-image-placeholder">
              <button 
                onClick={handleCoverImageUpload}
                className="cover-image-upload-btn"
                title="Add Cover Image"
              >
                <PhotoIcon />
                <span>Add Cover Image</span>
              </button>
            </div>
          )}
        </div>
        
        <div className="title-input-container">
          <label htmlFor="title-input" className="input-label">
            Title
          </label>
          <input
            id="title-input"
            type="text"
            value={draft.title}
            onChange={handleTitleChange}
            className="title-input"
          />
          
          <label htmlFor="summary-input" className="input-label">
            Summary
          </label>
          <textarea
            id="summary-input"
            value={draft.summary || ''}
            onChange={handleSummaryChange}
            className="summary-input"
            rows={3}
          />
          
          <label htmlFor="hashtag-input" className="input-label">
            Hashtags
          </label>
          <div className="hashtags-container">
            <div className="hashtag-input-wrapper">
              {draft.hashtags && draft.hashtags.length > 0 && (
                <div className="hashtags-inline">
                  {draft.hashtags.map((hashtag, index) => (
                    <span key={index} className="hashtag-tag-inline">
                      #{hashtag}
                      <button
                        type="button"
                        onClick={() => removeHashtag(hashtag)}
                        className="hashtag-remove-inline"
                        title="Remove hashtag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                id="hashtag-input"
                type="text"
                value={hashtagInput}
                onChange={handleHashtagInputChange}
                onKeyDown={handleHashtagKeyDown}
                className="hashtag-input"
                placeholder={draft.hashtags && draft.hashtags.length > 0 ? "" : "Type hashtags separated by commas..."}
              />
            </div>
          </div>
        </div>
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
          {/* Only show save button for drafts (kind 30024) */}
          {draft.kind === 30024 && (
            <button
              onClick={() => {
                if (editorRef.current) {
                  editorRef.current.save();
                }
              }}
              className="action-button save-button"
              title={hasUnsavedChanges ? "Save Draft (unsaved changes)" : "Save Draft"}
              disabled={isPublishing || !isConnected}
            >
              {isPublishing ? 'Saving...' : !isConnected ? 'Connecting...' : hasUnsavedChanges ? 'Save*' : 'Save'}
            </button>
          )}
          <button 
            onClick={async () => {
              // Publish directly - handlePublish will get the latest content from the editor
              await handlePublish();
            }} 
            className="action-button publish-button"
            title={draft.kind === 30023 ? "Update Published Post" : "Publish to Nostr"}
            disabled={isPublishing || !isConnected}
          >
            <ArrowUpTrayIcon />
            {isPublishing ? 'Publishing...' : !isConnected ? 'Connecting...' : draft.kind === 30023 ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>
    </main>
  );
} 