'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { getDrafts, deleteDraft } from '@/utils/storage';
import { useNostr } from '@/contexts/NostrContext';
import { NDKKind } from '@nostr-dev-kit/ndk';
import './DraftList.css';

interface Draft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
  sources: Array<'local' | 'nostr'>;
}

interface SavedDraft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
  sources?: Array<'local' | 'nostr'>;
}

export default function DraftList() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const { ndk } = useNostr();

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

  useEffect(() => {
    const loadDrafts = () => {
      const savedDrafts = getDrafts() as SavedDraft[];
      // Ensure all drafts have the sources property
      const draftsWithSources = savedDrafts.map(draft => ({
        ...draft,
        sources: draft.sources || ['local']
      }));
      setDrafts(draftsWithSources);
    };

    loadDrafts();
    window.addEventListener('storage', loadDrafts);
    return () => window.removeEventListener('storage', loadDrafts);
  }, []);

  useEffect(() => {
    const loadNostrDrafts = async () => {
      if (!ndk || !isAuthenticated) return;

      try {
        const nostr = window.nostr;
        if (!nostr) return;
        
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
                // Check if we have a local draft with the same content
                const existingDraft = prev.find(d => d.content === draft.content);
                if (existingDraft) {
                  // Merge the sources
                  return prev.map(d => 
                    d.content === draft.content 
                      ? { ...d, sources: [...new Set([...d.sources, 'nostr'])] as Array<'local' | 'nostr'> }
                      : d
                  );
                }
                return [...prev, draft];
              });
            }
          }
        );

        return () => {
          subscription.stop();
        };
      } catch (error) {
        console.error('Error loading Nostr drafts:', error);
      }
    };

    loadNostrDrafts();
  }, [ndk, isAuthenticated]);

  const handleCreateDraft = () => {
    const newDraft: Draft = {
      id: Date.now().toString(),
      title: 'Untitled Draft',
      content: '',
      lastModified: new Date().toISOString(),
      sources: ['local']
    };
    
    // Navigate immediately
    router.push(`/editor/${newDraft.id}`);
    
    // Update storage and state after navigation
    const updatedDrafts = [...drafts, newDraft];
    localStorage.setItem('drafts', JSON.stringify(updatedDrafts));
    setDrafts(updatedDrafts);
  };

  const handleDeleteDraft = (id: string, title: string, source: 'local' | 'nostr', e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      if (source === 'local') {
        deleteDraft(id);
        setDrafts(drafts.filter(draft => draft.id !== id));
      } else {
        // TODO: Implement Nostr draft deletion
        setDrafts(drafts.filter(draft => draft.id !== id));
      }
    }
  };

  return (
    <>
      <div className="action-bar">
        <div className="draft-count">
          {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}
        </div>
        <button onClick={handleCreateDraft} className="new-draft-button">
          <PlusIcon />
          New Draft
        </button>
      </div>

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
                onClick={(e) => handleDeleteDraft(draft.id, draft.title, draft.sources[0], e)}
                className="delete-button"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
} 