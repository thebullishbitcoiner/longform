'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PhotoIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Draft, saveLastDraft, getLastDraft, clearLastDraft, hasUnsavedDraft } from '@/utils/storage';
import { use } from 'react';
import Editor, { EditorRef } from '@/components/Editor';
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrSigner } from '@nostrify/types';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog } from '@/contexts/BlogContext';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';
import { AuthGuard } from '@/components/AuthGuard';
import './page.css';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import Image from 'next/image';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { nip19 } from 'nostr-tools';
import Link from 'next/link';

// Memoized cover image component to prevent re-renders
const CoverImage = React.memo(({ src, onError }: { src: string; onError: (e: React.SyntheticEvent<HTMLImageElement>) => void }) => {
  return (
    <Image 
      src={src}
      alt="Cover" 
      className="cover-image"
      width={800}
      height={400}
      style={{ width: '100%', height: 'auto' }}
      onError={onError}
      priority={false}
      unoptimized
    />
  );
});
CoverImage.displayName = 'CoverImage';

// Preview Modal Component
const PreviewModal = ({ draft, editorRef, onClose }: { 
  draft: Draft; 
  editorRef: React.RefObject<EditorRef | null>; 
  onClose: () => void;
}) => {
  const { currentUser, ndk } = useNostr();
  const { getAuthorProfile } = useBlog();
  
  // Get the latest content from the editor
  const [previewContent, setPreviewContent] = useState(draft.content);
  const [processedContent, setProcessedContent] = useState(draft.content);
  
  useEffect(() => {
    // Update content when modal opens
    if (editorRef.current) {
      try {
        const currentContent = editorRef.current.getContent();
        setPreviewContent(currentContent || draft.content);
      } catch {
        // Fallback to draft content if editor ref fails
        setPreviewContent(draft.content);
      }
    } else {
      setPreviewContent(draft.content);
    }
  }, [draft.content, editorRef]);

  // Process npubs in content
  useEffect(() => {
    const processNpubs = async (content: string) => {
      if (!ndk || !content) return content;
      
      // Match npubs with or without nostr: prefix, and also nprofile, note, nevent
      const nostrRegex = /(nostr:)?(nprofile1[a-zA-Z0-9]+|npub1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+)/g;
      const matches = Array.from(content.matchAll(nostrRegex));
      
      // Build a map of replacements
      const replacements = new Map<string, string>();
      
      // Process each unique match
      const processedMatches = new Set<string>();
      for (const match of matches) {
        const fullMatch = match[0];
        if (processedMatches.has(fullMatch)) continue;
        processedMatches.add(fullMatch);
        
        const cleanPart = fullMatch.replace(/^nostr:/, '');
        try {
          const decoded = nip19.decode(cleanPart);
          
          if (decoded.type === 'npub' || decoded.type === 'nprofile') {
            const pubkey = decoded.type === 'npub' ? decoded.data : decoded.data.pubkey;
            if (pubkey) {
              const profileUrl = `/profile/${nip19.npubEncode(pubkey)}`;
              const cachedProfile = getAuthorProfile(pubkey);
              let displayName = cachedProfile?.displayName || cachedProfile?.name;
              
              // Try to fetch profile if not cached
              if (!displayName && ndk) {
                try {
                  const user = ndk.getUser({ pubkey });
                  const profile = await user.fetchProfile();
                  if (profile && (profile.displayName || profile.name)) {
                    displayName = profile.displayName || profile.name;
                  }
                } catch (error) {
                  console.error('Error fetching profile for npub:', error);
                }
              }
              
              const linkText = displayName ? `@${displayName}` : `@${pubkey.slice(0, 8)}...`;
              replacements.set(fullMatch, `[${linkText}](${profileUrl})`);
            }
          } else if (decoded.type === 'note' || decoded.type === 'nevent') {
            const externalUrl = `https://njump.me/${cleanPart}`;
            replacements.set(fullMatch, `[${cleanPart}](${externalUrl})`);
          }
        } catch (error) {
          console.error('Error processing nostr link:', error);
          // Keep original if processing fails
        }
      }
      
      // Apply all replacements
      let processedContent = content;
      replacements.forEach((replacement, original) => {
        // Replace all occurrences using a global regex
        processedContent = processedContent.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
      });
      
      return processedContent;
    };

    const processContent = async () => {
      const processed = await processNpubs(previewContent);
      setProcessedContent(processed);
    };

    processContent();
  }, [previewContent, ndk, getAuthorProfile]);

  // Get author display name
  const authorDisplay = currentUser?.displayName || currentUser?.name || currentUser?.pubkey?.slice(0, 8) + '...' || 'Author';

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h2>Preview</h2>
          <button className="preview-modal-close" onClick={onClose}>
            <XMarkIcon />
          </button>
        </div>
        <div className="preview-modal-body">
          <article className="preview-post">
            {draft.coverImage && (
              <div className="preview-post-image">
                <Image 
                  src={draft.coverImage} 
                  alt={draft.title} 
                  width={800} 
                  height={400} 
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
                  style={{ width: '100%', height: 'auto' }} 
                  unoptimized 
                />
              </div>
            )}

            <header className="preview-header">
              <h1 className="preview-title">{draft.title}</h1>
              <div className="preview-metadata">
                <div className="preview-author">
                  <div className="preview-author-line">
                    <span className="preview-label">Author:</span>
                    <span className="preview-author-value">{authorDisplay}</span>
                  </div>
                  <div className="preview-date">
                    <span className="preview-label">Published:</span>
                    <time>{new Date().toLocaleDateString()}</time>
                  </div>
                </div>
              </div>
              
              {draft.hashtags && draft.hashtags.length > 0 && (
                <div className="preview-tags">
                  {draft.hashtags.map((tag: string) => (
                    <span key={tag} className="preview-tag">#{tag}</span>
                  ))}
                </div>
              )}
            </header>

            {draft.summary && (
              <div className="preview-summary">{draft.summary}</div>
            )}

            <div className="preview-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => {
                    if (!src || typeof src !== 'string') return null;
                    return (
                      <Image
                        src={src}
                        alt={alt || 'Image'}
                        width={800}
                        height={600}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
                        style={{ width: '100%', height: 'auto' }}
                        className="preview-markdown-image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                        unoptimized
                      />
                    );
                  },
                  a: ({ children, href, ...props }) => {
                    const isImageUrl = href?.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i);
                    if (isImageUrl && href) {
                      return (
                        <Image
                          src={href}
                          alt={children?.toString() || 'Image'}
                          width={800}
                          height={600}
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
                          style={{ width: '100%', height: 'auto' }}
                          className="preview-markdown-image"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                          unoptimized
                        />
                      );
                    }
                    
                    // Handle nostr profile links (njump.me or /profile/ links)
                    const isNostrLink = href?.includes('njump.me') || href?.startsWith('/profile/');
                    const isExternalLink = href?.startsWith('http://') || href?.startsWith('https://');
                    
                    if (isNostrLink && href?.startsWith('/profile/')) {
                      // Internal profile link
                      return (
                        <Link 
                          href={href} 
                          className="preview-link preview-nostr-link"
                          {...props}
                        >
                          {children}
                        </Link>
                      );
                    }
                    
                    return (
                      <a 
                        href={href} 
                        target={isExternalLink ? "_blank" : undefined}
                        rel={isExternalLink ? "noopener noreferrer" : undefined}
                        className={isNostrLink ? "preview-link preview-nostr-link" : "preview-link"}
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [lastDraft, setLastDraft] = useState<Draft | null>(null);
  const router = useRouter();
  const { id } = use(params);
  const { ndk, isConnected, isAuthenticated, currentUser } = useNostr();
  const editorRef = useRef<EditorRef | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State declarations
  const [hashtagInput, setHashtagInput] = useState('');
  const [showCoverImageTooltip, setShowCoverImageTooltip] = useState(false);
  const [coverImageMode, setCoverImageMode] = useState<'upload' | 'url'>('upload');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [showEditorActionsMenu, setShowEditorActionsMenu] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (showPreviewModal) {
      // Save current overflow style
      const originalOverflow = document.body.style.overflow;
      // Disable scrolling
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore original overflow when modal closes
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showPreviewModal]);

  // Auto-save function
  const autoSaveDraft = (currentDraft: Draft) => {
    // Only auto-save temporary drafts (not saved to Nostr yet)
    if (currentDraft.id.startsWith('temp_')) {
      saveLastDraft(currentDraft);
    }
  };

  // Debounced auto-save
  const debouncedAutoSave = useCallback((currentDraft: Draft) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveDraft(currentDraft);
    }, 2000); // Auto-save after 2 seconds of inactivity
  }, []);

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showCoverImageTooltip && 
          !target.closest('.cover-image-tooltip') && 
          !target.closest('.cover-image-tooltip-placeholder') &&
          !target.closest('.cover-image-icon-wrapper') &&
          !target.closest('.cover-image-upload-btn')) {
        setShowCoverImageTooltip(false);
        setCoverImageMode('upload');
        setCoverImageUrl('');
      }
    };

    if (showCoverImageTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCoverImageTooltip]);

  // Close editor actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showEditorActionsMenu && 
          !target.closest('.editor-actions-menu') && 
          !target.closest('.floating-pencil-icon')) {
        setShowEditorActionsMenu(false);
      }
    };

    if (showEditorActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEditorActionsMenu]);

  useEffect(() => {
    const loadDraft = async () => {
      console.log('Editor: Loading draft with ID:', id);
      setIsLoading(true);
      try {
        // Check if this is a temporary draft (new draft)
        if (id.startsWith('temp_')) {
          console.log('Editor: Creating new temporary draft');
          
          // Check if there's an unsaved draft in localStorage
          if (hasUnsavedDraft()) {
            const savedDraft = getLastDraft();
            if (savedDraft) {
              setLastDraft(savedDraft);
              setShowRestoreModal(true);
              // Create a temporary draft so the component can render while showing the modal
              const tempDraft: Draft = {
                id: id,
                title: 'Untitled Draft',
                content: '',
                lastModified: new Date().toISOString(),
                sources: ['local'],
                kind: 30024
              };
              setDraft(tempDraft);
              setIsLoading(false);
              return;
            }
          }
          
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
        if (ndk && isAuthenticated && currentUser?.pubkey) {
          try {
            const pubkey = currentUser.pubkey;
            console.log('Editor: User pubkey from context:', pubkey);
            
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
  }, [id, router, ndk, isAuthenticated, currentUser?.pubkey]);

  // Handle restore modal actions
  const handleRestoreDraft = () => {
    if (lastDraft) {
      // Update the draft ID to match the current URL
      const restoredDraft: Draft = {
        ...lastDraft,
        id: id,
        lastModified: new Date().toISOString(),
      };
      setDraft(restoredDraft);
      setHasUnsavedChanges(true);
      setShowRestoreModal(false);
      setLastDraft(null);
      toast.success('Draft restored from local storage');
    }
  };

  const handleDiscardDraft = () => {
    clearLastDraft();
    setShowRestoreModal(false);
    setLastDraft(null);
    
    // Create a fresh temporary draft
    const tempDraft: Draft = {
      id: id,
      title: 'Untitled Draft',
      content: '',
      lastModified: new Date().toISOString(),
      sources: ['local'],
      kind: 30024
    };
    setDraft(tempDraft);
  };

  const signer: NostrSigner = useMemo(() => ({
    getPublicKey: async () => {
      if (!isAuthenticated || !currentUser?.pubkey) {
        throw new Error('Not authenticated. Please log in with a Nostr extension.');
      }
      return currentUser.pubkey;
    },
    signEvent: async (event) => {
      if (!isAuthenticated || !currentUser?.pubkey) {
        throw new Error('Not authenticated. Please log in with a Nostr extension.');
      }
      const nostr = window.nostr;
      if (!nostr) {
        throw new Error('Nostr extension not found. Please install a Nostr extension.');
      }
      const { sig } = await nostr.signEvent({
        ...event,
        pubkey: currentUser.pubkey,
        id: '', // This will be computed by the uploader
        sig: ''
      });
      return {
        ...event,
        pubkey: currentUser.pubkey,
        id: '', // This will be computed by the uploader
        sig
      };
    }
  }), [isAuthenticated, currentUser?.pubkey]);

  const uploader = useMemo(() => new NostrBuildUploader({ 
    signer,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, init);
    }
  }), [signer]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    const updatedDraft = {
      ...draft,
      title: e.target.value,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
    debouncedAutoSave(updatedDraft);
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
    debouncedAutoSave(updatedDraft);
  };

  const handleDTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    
    console.log('Raw slug input:', e.target.value);
    
    // For now, just use the input value directly
    const urlFriendlyValue = e.target.value;
    
    console.log('Processed slug:', urlFriendlyValue);
    
    const updatedDraft = {
      ...draft,
      dTag: urlFriendlyValue,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
    debouncedAutoSave(updatedDraft);
  };

  const generateSlug = () => {
    if (!draft) return;
    
    // Generate slug from title: lowercase, replace spaces with dashes, remove special chars
    const generatedSlug = draft.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    const updatedDraft = {
      ...draft,
      dTag: generatedSlug,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
    debouncedAutoSave(updatedDraft);
  };

  // Use a ref to store the cover image URL and prevent unnecessary re-renders
  const coverImageRef = useRef<string>('');
  
  // Only update the ref when the cover image URL actually changes
  if (draft?.coverImage !== coverImageRef.current) {
    coverImageRef.current = draft?.coverImage || '';
  }

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
        debouncedAutoSave(updatedDraft);
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
        debouncedAutoSave(updatedDraft);
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
    debouncedAutoSave(updatedDraft);
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
        
        // Explicitly set the dTag if provided to prevent automatic generation
        if (updatedDraft.dTag?.trim()) {
          ndkEvent.dTag = updatedDraft.dTag.trim();
        }
        
        ndkEvent.tags = [
          ['title', updatedDraft.title],
          ['published_at', Math.floor(Date.now() / 1000).toString()],
          ['t', 'longform'],
          ['client', 'Longform._']
        ];
        
        // Add dTag to tags array if provided
        if (updatedDraft.dTag?.trim()) {
          ndkEvent.tags.push(['d', updatedDraft.dTag.trim()]);
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
        
        // Clear the auto-saved draft since it's now saved to Nostr
        clearLastDraft();
        
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
        
        // Explicitly set the dTag if provided to prevent automatic generation
        if (updatedDraft.dTag?.trim()) {
          ndkEvent.dTag = updatedDraft.dTag.trim();
        }
        
        console.log('Editor: Setting content for save:', {
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
          // Only use dTag if it's provided and not empty, otherwise don't add a d tag
          const dTagValue = updatedDraft.dTag?.trim();
          if (dTagValue) {
            const hasDTag = updatedTags.some(tag => tag[0] === 'd');
            if (!hasDTag) {
              updatedTags.push(['d', dTagValue]);
            } else {
              // Update existing d tag with the new value
              const dTagIndex = updatedTags.findIndex(tag => tag[0] === 'd');
              updatedTags[dTagIndex] = ['d', dTagValue];
            }
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
          
          // Add or update cover image tag (or remove if cleared)
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
          } else if (hasImageTag) {
            const imageTagIndex = filteredTags.findIndex(tag => tag[0] === 'image');
            filteredTags.splice(imageTagIndex, 1);
          }
          
          // Add client tag
          const hasClientTag = filteredTags.some(tag => tag[0] === 'client');
          if (!hasClientTag) {
            filteredTags.push(['client', 'Longform._']);
          }
          
          ndkEvent.tags = filteredTags;
        } else {
          // For new posts, use standard tags
          ndkEvent.tags = [
            ['title', updatedDraft.title],
            ['published_at', Math.floor(Date.now() / 1000).toString()],
            ['t', 'longform'],
            ['client', 'Longform._']
          ];
          
          // If updating a published post without original tags, add the "d" tag
          if (isUpdatingPublishedPost) {
            const dTagValue = updatedDraft.dTag?.trim();
            if (dTagValue) {
              ndkEvent.tags.push(['d', dTagValue]);
            }
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
          hasOriginalTags: !!updatedDraft.originalTags,
          originalDTag: updatedDraft.dTag,
          dTagInTags: ndkEvent.tags.find(tag => tag[0] === 'd')
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
        
        // Clear the auto-saved draft since it's now saved to Nostr
        clearLastDraft();
        
        // Update the URL to reflect the new Nostr event ID
        router.replace(`/editor/${ndkEvent.id}`);
        
        toast.success('Draft saved.');
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
      toast.error('Please log in to upload images.');
      return;
    }

    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true; // Enable multiple file selection

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      
      // Show initial progress toast
      if (fileArray.length > 1) {
        toast.loading(`Uploading ${fileArray.length} images...`, { id: 'batch-upload' });
      }

      let successCount = 0;
      let errorCount = 0;
      const uploadedImages: string[] = [];

      // Process each file
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        
        try {
          console.log(`Editor: Uploading image ${i + 1}/${fileArray.length}:`, file.name);
          const [[, url]] = await uploader.upload(file);
          console.log(`Editor: Image uploaded to:`, url);
          
          // Store the image markdown for batch insertion
          const imageMarkdown = `![${file.name}](${url})`;
          uploadedImages.push(imageMarkdown);
          successCount++;

          // Update progress for multiple files
          if (fileArray.length > 1) {
            toast.loading(`Uploaded ${successCount}/${fileArray.length} images...`, { id: 'batch-upload' });
          }
        } catch (error) {
          console.error(`Editor: Error uploading image ${file.name}:`, error);
          errorCount++;
        }
      }

      // Insert all uploaded images
      if (uploadedImages.length > 0) {
        const allImagesMarkdown = uploadedImages.join('\n\n');
        
        if (editorRef.current) {
          editorRef.current.insertAtCursor(allImagesMarkdown);
          setHasUnsavedChanges(true);
        } else {
          // Fallback: append to end if editor ref is not available
          const updatedDraft = {
            ...draft,
            content: draft.content + '\n' + allImagesMarkdown + '\n',
            lastModified: new Date().toISOString(),
          };
          setDraft(updatedDraft);
          setHasUnsavedChanges(true);
          debouncedAutoSave(updatedDraft);
        }
      }

      // Show final result
      if (fileArray.length > 1) {
        toast.dismiss('batch-upload');
        if (successCount === fileArray.length) {
          toast.success(`Successfully uploaded ${successCount} images!`);
        } else if (successCount > 0) {
          toast.success(`Uploaded ${successCount} images, ${errorCount} failed`);
        } else {
          toast.error('Failed to upload any images');
        }
      } else {
        // Single file upload
        if (successCount > 0) {
          toast.success('Image uploaded and inserted!');
        } else {
          toast.error('Failed to upload image. Please try again.');
        }
      }
    };

    input.click();
  };

  const handleCoverImageUpload = useCallback(async () => {
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
        debouncedAutoSave(updatedDraft);
        // Don't automatically save - let the user decide when to save
        toast.success('Cover image uploaded successfully!');
      } catch (error) {
        console.error('Editor: Error uploading cover image:', error);
        toast.error('Failed to upload cover image. Please try again.');
      }
    };

    input.click();
  }, [draft, isAuthenticated, uploader, setDraft, setHasUnsavedChanges, debouncedAutoSave]);

  const handleCoverImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCoverImageUrl(e.target.value);
  };

  const handleCoverImageUrlSubmit = () => {
    if (!draft) return;
    
    const trimmedUrl = coverImageUrl.trim();
    if (!trimmedUrl) {
      toast.error('Please enter a valid URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    const updatedDraft = {
      ...draft,
      coverImage: trimmedUrl,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
    debouncedAutoSave(updatedDraft);
    setCoverImageUrl('');
    setShowCoverImageTooltip(false);
    toast.success('Cover image URL set successfully!');
  };

  const handleChooseFromLibrary = () => {
    setShowCoverImageTooltip(false);
    handleCoverImageUpload();
  };

  const handleRemoveCoverImage = () => {
    if (!draft) return;
    const updatedDraft = {
      ...draft,
      coverImage: undefined,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    setHasUnsavedChanges(true);
    debouncedAutoSave(updatedDraft);
    setCoverImageUrl('');
    setCoverImageMode('upload');
    setShowCoverImageTooltip(false);
    toast.success('Cover image removed.');
  };

  const handleShowUrlInput = () => {
    setCoverImageMode('url');
    // Keep tooltip open to show URL input
  };

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('Failed to load cover image:', draft?.coverImage);
    e.currentTarget.style.display = 'none';
  }, [draft?.coverImage]);

  const handlePublish = async () => {
    if (!draft || !ndk || !isAuthenticated) {
      toast.error('Please log in with a Nostr extension to publish.');
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
      
      // Explicitly set the dTag if provided to prevent automatic generation
      if (draft.dTag?.trim()) {
        ndkEvent.dTag = draft.dTag.trim();
      }
      
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
        // Only use dTag if it's provided and not empty, otherwise don't add a d tag
        const dTagValue = draft.dTag?.trim();
        if (dTagValue) {
          const hasDTag = updatedTags.some(tag => tag[0] === 'd');
          if (!hasDTag) {
            updatedTags.push(['d', dTagValue]);
          } else {
            // Update existing d tag with the new value
            const dTagIndex = updatedTags.findIndex(tag => tag[0] === 'd');
            updatedTags[dTagIndex] = ['d', dTagValue];
          }
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
        
        // Add or update cover image tag (or remove if cleared)
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
        } else if (hasImageTag) {
          const imageTagIndex = filteredTags.findIndex(tag => tag[0] === 'image');
          filteredTags.splice(imageTagIndex, 1);
        }
        
        // Add client tag
        const hasClientTag = filteredTags.some(tag => tag[0] === 'client');
        if (!hasClientTag) {
          filteredTags.push(['client', 'Longform._']);
        }
        
        ndkEvent.tags = filteredTags;
      } else if (isUpdatingPublishedPost) {
        // Updating a published post but no original tags available
        // We need to preserve the original published_at timestamp
        const originalPublishedAt = draft.originalTags?.find(tag => tag[0] === 'published_at')?.[1];
        
        ndkEvent.tags = [
          ['title', draft.title],
          ['published_at', originalPublishedAt || Math.floor(Date.now() / 1000).toString()],
          ['t', 'longform'],
          ['client', 'Longform._']
        ];
        
        // Add the "d" tag to link to the original post
        const dTagValue = draft.dTag?.trim();
        if (dTagValue) {
          ndkEvent.tags.push(['d', dTagValue]);
        }
        
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
          ['t', 'longform'],
          ['client', 'Longform._']
        ];
        
        // Add dTag to tags array if provided
        if (draft.dTag?.trim()) {
          ndkEvent.tags.push(['d', draft.dTag.trim()]);
        }
        
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
        hasOriginalTags: !!draft.originalTags,
        originalDTag: draft.dTag,
        dTagInTags: ndkEvent.tags.find(tag => tag[0] === 'd')
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
      
      // Clear the auto-saved draft since it's now published to Nostr
      clearLastDraft();
      
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

  return (
    <AuthGuard>
      {isLoading ? (
        <main className="container">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading draft...</p>
          </div>
        </main>
      ) : !draft ? null : (
      <main className="container editor-page">
      <div className="editor-content">
        <button onClick={() => router.push('/')} className="back-button">
          <ArrowLeftIcon />
          Back to Posts
        </button>
        <h1 className="editor-title">
          {draft.kind === 30023 ? 'Edit Post' : 'Edit Draft'}
        </h1>
        
        {/* Cover Image Section - First */}
        <div className="cover-image-section">
          {draft.coverImage ? (
            <div className="cover-image-container">
              <div className="cover-image-preview">
                <CoverImage 
                  src={draft.coverImage}
                  onError={handleImageError}
                />
              </div>
              <div className="cover-image-icon-wrapper">
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCoverImageTooltip(!showCoverImageTooltip);
                  }}
                  className="cover-image-icon-btn"
                  title="Change Cover Image"
                >
                  <PhotoIcon />
                </button>
                {showCoverImageTooltip && (
                  <div className="cover-image-tooltip">
                    {coverImageMode === 'url' ? (
                      <div className="tooltip-url-input">
                        <input
                          type="text"
                          value={coverImageUrl}
                          onChange={handleCoverImageUrlChange}
                          placeholder="Enter image URL"
                          className="tooltip-input"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCoverImageUrlSubmit();
                            } else if (e.key === 'Escape') {
                              setShowCoverImageTooltip(false);
                              setCoverImageMode('upload');
                            }
                          }}
                        />
                        <button
                          onClick={handleCoverImageUrlSubmit}
                          className="tooltip-submit-btn"
                        >
                          Set
                        </button>
                        <button
                          onClick={() => {
                            setCoverImageMode('upload');
                            setCoverImageUrl('');
                          }}
                          className="tooltip-back-btn"
                        >
                          ← Back
                        </button>
                      </div>
                    ) : (
                      <div className="tooltip-options">
                        <button 
                          onClick={handleShowUrlInput}
                          className="tooltip-option"
                        >
                          Image URL
                        </button>
                        <button 
                          onClick={handleChooseFromLibrary}
                          className="tooltip-option"
                        >
                          Choose from library
                        </button>
                        <button 
                          onClick={handleRemoveCoverImage}
                          className="tooltip-option tooltip-option-remove"
                        >
                          Remove cover image
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="cover-image-placeholder">
              <button 
                onClick={() => setShowCoverImageTooltip(!showCoverImageTooltip)}
                className="cover-image-upload-btn"
                title="Add Cover Image"
              >
                <PhotoIcon />
                <span>Add Cover Image</span>
              </button>
              {showCoverImageTooltip && (
                <div className="cover-image-tooltip-placeholder">
                  {coverImageMode === 'url' ? (
                    <div className="tooltip-url-input">
                      <input
                        type="text"
                        value={coverImageUrl}
                        onChange={handleCoverImageUrlChange}
                        placeholder="Enter image URL"
                        className="tooltip-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCoverImageUrlSubmit();
                          } else if (e.key === 'Escape') {
                            setShowCoverImageTooltip(false);
                            setCoverImageMode('upload');
                          }
                        }}
                      />
                      <button
                        onClick={handleCoverImageUrlSubmit}
                        className="tooltip-submit-btn"
                      >
                        Set
                      </button>
                      <button
                        onClick={() => {
                          setCoverImageMode('upload');
                          setCoverImageUrl('');
                        }}
                        className="tooltip-back-btn"
                      >
                        ← Back
                      </button>
                    </div>
                  ) : (
                    <div className="tooltip-options">
                      <button 
                        onClick={handleShowUrlInput}
                        className="tooltip-option"
                      >
                        Image URL
                      </button>
                      <button 
                        onClick={handleChooseFromLibrary}
                        className="tooltip-option"
                      >
                        Choose from library
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Title Section - Second */}
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
        </div>

        {/* Slug Section - Third */}
        <div className="slug-input-container">
          <label htmlFor="slug-input" className="input-label">
            Slug
          </label>
          <div className="slug-input-wrapper">
            <input
              id="slug-input"
              type="text"
              value={draft.dTag || ''}
              onChange={handleDTagChange}
              className="slug-input"
            />
            <button
              type="button"
              onClick={generateSlug}
              className="generate-slug-button"
              title="Generate slug from title"
            >
              Generate
            </button>
          </div>
        </div>

        {/* Summary Section - Fourth */}
        <div className="summary-section">
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
        </div>

        {/* Hashtags Section - Fifth */}
        <div className="hashtags-container">
          <label htmlFor="hashtag-input" className="input-label">
            Hashtags
          </label>
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
      <Editor 
        draft={draft} 
        onSave={handleSave} 
        onContentChange={debouncedAutoSave}
        ref={editorRef} 
      />
      
      {/* Floating Pencil Icon */}
      <div 
        className="floating-pencil-icon"
        onClick={() => setShowEditorActionsMenu(!showEditorActionsMenu)}
      >
        <PencilIcon className="floating-pencil-icon-svg" />
      </div>

      {/* Editor Actions Menu */}
      {showEditorActionsMenu && (
        <div className="editor-actions-menu">
          <button 
            onClick={() => {
              handleImageUpload();
              setShowEditorActionsMenu(false);
            }} 
            className="editor-action-menu-item"
            title="Upload Image (supports multiple selection)"
          >
            Upload Image
          </button>
          {/* Only show save button for drafts (kind 30024) */}
          {draft.kind === 30024 && (
            <button
              onClick={() => {
                if (editorRef.current) {
                  editorRef.current.save();
                }
                setShowEditorActionsMenu(false);
              }}
              className="editor-action-menu-item"
              title={hasUnsavedChanges ? "Save Draft (unsaved changes)" : "Save Draft"}
              disabled={isPublishing || !isConnected}
            >
              {isPublishing ? 'Saving...' : !isConnected ? 'Connecting...' : hasUnsavedChanges ? 'Save*' : 'Save'}
            </button>
          )}
          <button 
            onClick={() => {
              // Get latest content from editor before showing preview
              if (editorRef.current) {
                const currentContent = editorRef.current.getContent();
                if (currentContent && draft) {
                  const updatedDraft = { ...draft, content: currentContent };
                  setDraft(updatedDraft);
                }
              }
              setShowPreviewModal(true);
              setShowEditorActionsMenu(false);
            }} 
            className="editor-action-menu-item"
            title="Preview Post"
          >
            Preview
          </button>
          <button 
            onClick={async () => {
              // Publish directly - handlePublish will get the latest content from the editor
              await handlePublish();
              setShowEditorActionsMenu(false);
            }} 
            className="editor-action-menu-item"
            title={draft.kind === 30023 ? "Update Published Post" : "Publish to Nostr"}
            disabled={isPublishing || !isConnected}
          >
            {isPublishing ? 'Publishing...' : !isConnected ? 'Connecting...' : draft.kind === 30023 ? 'Update' : 'Publish'}
          </button>
        </div>
      )}
      
      {/* Preview Modal */}
      {showPreviewModal && (
        <PreviewModal
          draft={draft}
          editorRef={editorRef}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
      
      {/* Restore Draft Modal */}
      <ConfirmModal
        isOpen={showRestoreModal}
        onClose={handleDiscardDraft}
        onConfirm={handleRestoreDraft}
        title="Restore Unsaved Draft"
        message={`You have an unsaved draft from ${lastDraft ? new Date(lastDraft.lastModified).toLocaleString() : ''}. Would you like to restore it?`}
      />
    </main>
      )}
    </AuthGuard>
  );
} 