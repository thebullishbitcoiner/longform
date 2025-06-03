'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { getDrafts, deleteDraft } from '@/utils/storage';
import { useNostr } from '@/contexts/NostrContext';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import './DraftList.css';

interface Draft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
  source?: 'local' | 'nostr';
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
      const savedDrafts = getDrafts();
      setDrafts(savedDrafts.map(draft => ({ ...draft, source: 'local' })));
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
                source: 'nostr'
              };
              setDrafts(prev => {
                const filtered = prev.filter(d => d.id !== draft.id);
                return [...filtered, draft];
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
    const newDraft = {
      id: Date.now().toString(),
      title: 'Untitled Draft',
      content: '',
      lastModified: new Date().toISOString(),
      source: 'local' as const
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
                  <span className={`draft-source ${draft.source}`}>
                    {draft.source === 'nostr' ? 'Nostr' : 'Local'}
                  </span>
                </div>
                <div className="draft-date">
                  Last Modified: {new Date(draft.lastModified).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteDraft(draft.id, draft.title, draft.source!, e)}
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