'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, TrashIcon, InformationCircleIcon, XMarkIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import {
    isValidRelayUrl,
    testRelayConnection,
    createPreferredRelaysEvent,
    parsePreferredRelaysEvent,
    type PreferredRelay
} from '@/utils/preferredRelays';
import {
    createRelayListEvent,
    parseRelayListEvent,
    type RelayInfo
} from '@/utils/relayList';
import toast from 'react-hot-toast';
import { AuthGuard } from '@/components/AuthGuard';
import { cleanupStorage } from '@/utils/storage';
import { ProFeature } from '@/components/ProFeature';
import { getCustomEmojis, addCustomEmoji, removeCustomEmoji } from '@/utils/supabase';
import { CustomEmoji } from '@/config/supabase';
import JSZip from 'jszip';
import './page.css';

interface BackupPost {
    id: string;
    title: string;
    content: string;
    created_at: number;
    tags: string[][];
    dTag?: string;
}

export default function SettingsPage() {
    const { isAuthenticated, currentUser, ndk } = useNostr();
    const [preferredRelays, setPreferredRelays] = useState<PreferredRelay[]>([]);
    const [relayList, setRelayList] = useState<RelayInfo[]>([]);
    const [newRelayUrl, setNewRelayUrl] = useState('');
    const [newRelayPolicy, setNewRelayPolicy] = useState<'read' | 'write' | 'readwrite'>('readwrite');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingRelayList, setIsLoadingRelayList] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showRelayListInfoModal, setShowRelayListInfoModal] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [cacheData, setCacheData] = useState<Array<{key: string, value: string, size: number}>>([]);
    const [showCacheInfoModal, setShowCacheInfoModal] = useState(false);
    const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
    const [showAddEmojiModal, setShowAddEmojiModal] = useState(false);
    const [newEmojiUrl, setNewEmojiUrl] = useState('');
    const [newEmojiName, setNewEmojiName] = useState('');
    const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
    const [backupPosts, setBackupPosts] = useState<BackupPost[]>([]);
    const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
    const [isLoadingBackup, setIsLoadingBackup] = useState(false);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);

    const loadPreferredRelays = useCallback(async () => {
        if (currentUser?.pubkey) {
            setIsLoading(true);
            try {
                const events = await ndk.fetchEvents({
                    kinds: [10013 as number], // NIP-37 preferred relays kind
                    authors: [currentUser.pubkey],
                    limit: 1
                });
                
                if (events.size > 0) {
                    const latestEvent = Array.from(events)[0];
                    
                    // Parse NIP-44 encrypted private tags from the event
                    const networkRelays = await parsePreferredRelaysEvent(latestEvent, ndk);
                    setPreferredRelays(networkRelays);
                } else {
                    setPreferredRelays([]);
                }
            } catch (error) {
                console.warn('Failed to fetch preferred relays from Nostr:', error);
                setPreferredRelays([]);
            } finally {
                setIsLoading(false);
            }
        }
    }, [currentUser?.pubkey, ndk]);

    const loadRelayList = useCallback(async () => {
        if (currentUser?.pubkey) {
            setIsLoadingRelayList(true);
            try {
                const events = await ndk.fetchEvents({
                    kinds: [10002], // NIP-65 relay list kind
                    authors: [currentUser.pubkey],
                    limit: 1
                });
                
                if (events.size > 0) {
                    const latestEvent = Array.from(events)[0];
                    const networkRelays = parseRelayListEvent(latestEvent);
                    setRelayList(networkRelays);
                } else {
                    setRelayList([]);
                }
            } catch (error) {
                console.warn('Failed to fetch relay list from Nostr:', error);
                setRelayList([]);
            } finally {
                setIsLoadingRelayList(false);
            }
        }
    }, [currentUser?.pubkey, ndk]);

    // Load relays from localStorage on component mount
    useEffect(() => {
        if (isAuthenticated && currentUser) {
            loadPreferredRelays();
            loadRelayList();
        }
    }, [isAuthenticated, currentUser, loadPreferredRelays, loadRelayList]);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (showInfoModal || showRelayListInfoModal || showCacheInfoModal || showAddEmojiModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        // Cleanup function to restore scrolling when component unmounts
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showInfoModal, showRelayListInfoModal, showCacheInfoModal, showAddEmojiModal]);

    const handleSavePreferredRelays = (relays: PreferredRelay[]) => {
        setPreferredRelays(relays);
    };

    const addRelay = () => {
        if (!newRelayUrl.trim()) {
            toast.error('Please enter a relay URL');
            return;
        }

        // Basic URL validation
        if (!isValidRelayUrl(newRelayUrl)) {
            toast.error('Please enter a valid relay URL (must start with wss:// or ws://)');
            return;
        }

        // Check if relay already exists
        if (preferredRelays.some(relay => relay.url === newRelayUrl)) {
            toast.error('This relay is already in your preferred list');
            return;
        }

        const newRelay: PreferredRelay = {
            url: newRelayUrl.trim(),
            policy: newRelayPolicy
        };

        const updatedRelays = [...preferredRelays, newRelay];
        handleSavePreferredRelays(updatedRelays);

        // Reset form
        setNewRelayUrl('');
        setNewRelayPolicy('readwrite');
    };

    const removeRelay = (url: string) => {
        const updatedRelays = preferredRelays.filter(relay => relay.url !== url);
        handleSavePreferredRelays(updatedRelays);
    };

    const updateRelayPolicy = (url: string, policy: 'read' | 'write' | 'readwrite') => {
        const updatedRelays = preferredRelays.map(relay =>
            relay.url === url ? { ...relay, policy } : relay
        );
        handleSavePreferredRelays(updatedRelays);
    };

    const handleTestRelayConnection = async (url: string) => {
        setIsLoading(true);
        try {
            const isConnected = await testRelayConnection(url);
            if (isConnected) {
                toast.success(`Successfully connected to ${url}`);
            } else {
                toast.error(`Failed to connect to ${url}`);
            }
        } catch (error) {
            console.error('Error testing relay:', error);
            toast.error(`Failed to connect to ${url}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Relay List (NIP-65) functions
    const handleSaveRelayList = (relays: RelayInfo[]) => {
        setRelayList(relays);
    };

    const addRelayToList = () => {
        if (!newRelayUrl.trim()) {
            toast.error('Please enter a relay URL');
            return;
        }

        if (!isValidRelayUrl(newRelayUrl)) {
            toast.error('Please enter a valid relay URL (must start with wss:// or ws://)');
            return;
        }

        if (relayList.some(relay => relay.url === newRelayUrl)) {
            toast.error('This relay is already in your relay list');
            return;
        }

        const newRelay: RelayInfo = {
            url: newRelayUrl.trim(),
            read: newRelayPolicy === 'read' || newRelayPolicy === 'readwrite',
            write: newRelayPolicy === 'write' || newRelayPolicy === 'readwrite'
        };

        const updatedRelays = [...relayList, newRelay];
        handleSaveRelayList(updatedRelays);

        setNewRelayUrl('');
        setNewRelayPolicy('readwrite');
    };

    const removeRelayFromList = (url: string) => {
        const updatedRelays = relayList.filter(relay => relay.url !== url);
        handleSaveRelayList(updatedRelays);
    };

    const updateRelayListPermissions = (url: string, read: boolean, write: boolean) => {
        const updatedRelays = relayList.map(relay => 
            relay.url === url ? { ...relay, read, write } : relay
        );
        handleSaveRelayList(updatedRelays);
    };

    const publishRelayList = async () => {
        if (!currentUser?.pubkey || relayList.length === 0) {
            toast.error('No relays to publish');
            return;
        }

        setIsPublishing(true);
        try {
            const event = createRelayListEvent(relayList);
            event.tags.push(['client', 'Longform._']);
            
            // Ensure the event is associated with the NDK instance
            event.ndk = ndk;
            
            await event.publish();
            toast.success('Relay list published to Nostr network');
        } catch (error) {
            console.error('Error publishing relay list:', error);
            toast.error('Failed to publish relay list');
        } finally {
            setIsPublishing(false);
        }
    };



    const publishPreferredRelays = async () => {
        if (!currentUser?.pubkey || preferredRelays.length === 0) {
            toast.error('No preferred relays to publish');
            return;
        }

        setIsPublishing(true);
        try {
            // Create a NIP-37 preferred relays event with NIP-44 encrypted private tags
            const event = await createPreferredRelaysEvent(ndk, preferredRelays);
            event.tags.push(['client', 'Longform._']);
            
            await event.publish();
            toast.success('Preferred relays published to Nostr network (NIP-44 encrypted)');
        } catch (error) {
            console.error('Error publishing preferred relays:', error);
            toast.error('Failed to publish preferred relays');
        } finally {
            setIsPublishing(false);
        }
    };

    // Cache management functions
    const loadCacheData = useCallback(() => {
        if (typeof window === 'undefined') return;

        const data: Array<{key: string, value: string, size: number}> = [];
        
        // Get all localStorage keys that start with 'longform_'
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('longform_')) {
                try {
                    const value = localStorage.getItem(key) || '';
                    const size = new Blob([value]).size;
                    data.push({ key, value, size });
                } catch (error) {
                    console.error(`Error reading cache key ${key}:`, error);
                }
            }
        }
        
        // Sort by size (largest first)
        data.sort((a, b) => b.size - a.size);
        setCacheData(data);
    }, []);

    const deleteCacheKey = (key: string) => {
        try {
            localStorage.removeItem(key);
            toast.success(`Deleted cache key: ${key}`);
            loadCacheData(); // Reload the cache data
        } catch (error) {
            console.error('Error deleting cache key:', error);
            toast.error('Failed to delete cache key');
        }
    };

    const clearAllCache = () => {
        try {
            // Only clear longform_ keys
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('longform_')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            toast.success(`Cleared ${keysToRemove.length} cache entries`);
            loadCacheData(); // Reload the cache data
        } catch (error) {
            console.error('Error clearing cache:', error);
            toast.error('Failed to clear cache');
        }
    };

    const runStorageCleanup = () => {
        try {
            cleanupStorage();
            toast.success('Storage cleanup completed');
            loadCacheData(); // Reload the cache data
        } catch (error) {
            console.error('Error running storage cleanup:', error);
            toast.error('Failed to run storage cleanup');
        }
    };

    // Load cache data on component mount
    useEffect(() => {
        loadCacheData();
    }, [loadCacheData]);

    // Load custom emojis from Supabase
    const loadCustomEmojis = useCallback(async () => {
        if (!currentUser?.npub) return;
        
        setIsLoadingEmojis(true);
        try {
            const emojis = await getCustomEmojis(currentUser.npub);
            setCustomEmojis(emojis);
        } catch (error) {
            console.error('Error loading custom emojis:', error);
            toast.error('Failed to load custom emojis');
        } finally {
            setIsLoadingEmojis(false);
        }
    }, [currentUser?.npub]);

    // Load custom emojis on component mount
    useEffect(() => {
        if (isAuthenticated && currentUser?.npub) {
            loadCustomEmojis();
        }
    }, [isAuthenticated, currentUser?.npub, loadCustomEmojis]);

    // Backup functions
    const loadBackupPosts = useCallback(async () => {
        if (!currentUser?.pubkey || !ndk) return;

        setIsLoadingBackup(true);
        try {
            // Fetch user's published posts (kind 30023)
            const postsQuery = await ndk.fetchEvents({
                kinds: [30023],
                authors: [currentUser.pubkey],
                limit: 100,
            });

            // Fetch deletion events (kind 5) to filter out deleted posts
            const deletionQuery = await ndk.fetchEvents({
                kinds: [5],
                authors: [currentUser.pubkey],
                limit: 100,
            });

            // Create a set of deleted event IDs
            const deletedEventIds = new Set<string>();
            deletionQuery.forEach(deletionEvent => {
                deletionEvent.tags.forEach((tag: string[]) => {
                    if (tag[0] === 'e') {
                        deletedEventIds.add(tag[1]);
                    }
                });
            });

            const allPosts = Array.from(postsQuery);
            const backupPosts: BackupPost[] = allPosts
                .filter(event => !deletedEventIds.has(event.id))
                .map(event => {
                    const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
                    const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];

                    return {
                        id: event.id,
                        title,
                        content: event.content,
                        created_at: event.created_at || 0,
                        tags: event.tags,
                        dTag
                    };
                })
                .sort((a, b) => b.created_at - a.created_at);

            setBackupPosts(backupPosts);
        } catch (error) {
            console.error('Error loading backup posts:', error);
            toast.error('Failed to load posts for backup');
        } finally {
            setIsLoadingBackup(false);
        }
    }, [currentUser?.pubkey, ndk]);

    // Load backup posts on component mount
    useEffect(() => {
        if (isAuthenticated && currentUser?.pubkey) {
            loadBackupPosts();
        }
    }, [isAuthenticated, currentUser?.pubkey, loadBackupPosts]);

    // Custom emoji functions
    const handleAddCustomEmoji = async () => {
        if (!currentUser?.npub) {
            toast.error('User not authenticated');
            return;
        }

        if (!newEmojiUrl.trim()) {
            toast.error('Please enter an emoji URL');
            return;
        }

        if (!newEmojiName.trim()) {
            toast.error('Please enter an emoji name');
            return;
        }

        // Basic URL validation
        try {
            new URL(newEmojiUrl);
        } catch {
            toast.error('Please enter a valid URL');
            return;
        }

        // Check if emoji already exists
        if (customEmojis.some(emoji => emoji.url === newEmojiUrl || emoji.name === newEmojiName)) {
            toast.error('This emoji already exists');
            return;
        }

        try {
            const newEmoji = await addCustomEmoji(
                currentUser.npub,
                newEmojiName.trim(),
                newEmojiUrl.trim()
            );

            if (newEmoji) {
                setCustomEmojis(prev => [newEmoji, ...prev]);
                setNewEmojiUrl('');
                setNewEmojiName('');
                setShowAddEmojiModal(false);
                toast.success('Custom emoji added successfully');
            } else {
                toast.error('Failed to add custom emoji');
            }
        } catch (error) {
            console.error('Error adding custom emoji:', error);
            toast.error('Failed to add custom emoji');
        }
    };

    const handleRemoveCustomEmoji = async (name: string) => {
        if (!currentUser?.npub) {
            toast.error('User not authenticated');
            return;
        }

        try {
            const success = await removeCustomEmoji(currentUser.npub, name);
            if (success) {
                setCustomEmojis(prev => prev.filter(emoji => emoji.name !== name));
                toast.success('Custom emoji removed');
            } else {
                toast.error('Failed to remove custom emoji');
            }
        } catch (error) {
            console.error('Error removing custom emoji:', error);
            toast.error('Failed to remove custom emoji');
        }
    };

    const togglePostSelection = (postId: string) => {
        setSelectedPosts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(postId)) {
                newSet.delete(postId);
            } else {
                newSet.add(postId);
            }
            return newSet;
        });
    };

    const selectAllPosts = () => {
        setSelectedPosts(new Set(backupPosts.map(post => post.id)));
    };

    const deselectAllPosts = () => {
        setSelectedPosts(new Set());
    };

    const createBackup = async () => {
        if (selectedPosts.size === 0) {
            toast.error('Please select at least one post to backup');
            return;
        }

        setIsCreatingBackup(true);
        try {
            const zip = new JSZip();
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-dd format
            
            // Add selected posts to zip
            for (const postId of selectedPosts) {
                const post = backupPosts.find(p => p.id === postId);
                if (post) {
                    // Use d-tag as filename, fallback to post ID if no d-tag
                    const filename = `${post.dTag || post.id}.md`;
                    
                    // Only include the post content
                    const markdownContent = post.content;

                    zip.file(filename, markdownContent);
                }
            }

            // Generate and download the zip file
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `longform_backup_${timestamp}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success(`Backup created with ${selectedPosts.size} posts`);
            setSelectedPosts(new Set());
        } catch (error) {
            console.error('Error creating backup:', error);
            toast.error('Failed to create backup');
        } finally {
            setIsCreatingBackup(false);
        }
    };



    return (
        <AuthGuard>
            {isLoading || isLoadingRelayList ? (
                <main className="container">
                    <div className="loading-content">
                        <div className="loading-spinner"></div>
                        <p className="loading-text">
                            {isLoading && isLoadingRelayList 
                                ? "Loading kinds 30078 and 10002..." 
                                : isLoading 
                                ? "Loading kind 30078 (NIP-37 preferred relays)..." 
                                : "Loading kind 10002 (NIP-65 relay list)..."
                            }
                        </p>
                    </div>
                </main>
            ) : (
            <main className="container">
            <div className="settings-header">
                <h1>Settings</h1>
            </div>

            <div className="settings-content">
                <section className="settings-section">
                    <div className="section-header">
                        <h2>Preferred Relays</h2>
                        <button
                            onClick={() => setShowInfoModal(true)}
                            className="info-button"
                            title="Learn more about preferred relays"
                        >
                            <InformationCircleIcon />
                        </button>
                    </div>

                    {preferredRelays.length === 0 && (
                        <p className="no-relays">No preferred relays configured. Add some relays below.</p>
                    )}

                    <div className="add-relay-form">
                        <div className="form-row">
                            <input
                                type="text"
                                value={newRelayUrl}
                                onChange={(e) => setNewRelayUrl(e.target.value)}
                                placeholder="wss://relay.example.com"
                                className="relay-url-input"
                            />
                            <select
                                value={newRelayPolicy}
                                onChange={(e) => setNewRelayPolicy(e.target.value as 'read' | 'write' | 'readwrite')}
                                className="policy-select"
                            >
                                <option value="read">Read Only</option>
                                <option value="write">Write Only</option>
                                <option value="readwrite">Read & Write</option>
                            </select>
                            <button onClick={addRelay} className="add-button">
                                <PlusIcon />
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="relays-list">
                        {preferredRelays.length > 0 && (
                            preferredRelays.map((relay, index) => (
                                <div key={index} className="relay-item">
                                    <div className="relay-info">
                                        <span className="relay-url">{relay.url}</span>
                                    </div>
                                    <div className="relay-controls">
                                        <div className="permission-toggles">
                                            <label className="permission-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={relay.policy === 'read' || relay.policy === 'readwrite'}
                                                    onChange={(e) => updateRelayPolicy(relay.url, e.target.checked ? (relay.policy === 'write' ? 'readwrite' : 'read') : (relay.policy === 'readwrite' ? 'write' : 'write'))}
                                                />
                                                Read
                                            </label>
                                            <label className="permission-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={relay.policy === 'write' || relay.policy === 'readwrite'}
                                                    onChange={(e) => updateRelayPolicy(relay.url, e.target.checked ? (relay.policy === 'read' ? 'readwrite' : 'write') : (relay.policy === 'readwrite' ? 'read' : 'read'))}
                                                />
                                                Write
                                            </label>
                                        </div>
                                        <div className="relay-actions">
                                            <button
                                                onClick={() => handleTestRelayConnection(relay.url)}
                                                disabled={isLoading}
                                                className="test-button"
                                                title="Test connection"
                                            >
                                                Test
                                            </button>
                                            <button
                                                onClick={() => removeRelay(relay.url)}
                                                className="remove-button"
                                                title="Remove relay"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    
                    <div className="section-actions">
                        <button
                            onClick={publishPreferredRelays}
                            className="save-button"
                            disabled={preferredRelays.length === 0 || isPublishing}
                        >
                            {isPublishing ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </section>

                <section className="settings-section">
                    <div className="section-header">
                        <h2>Relay List ({relayList.length})</h2>
                        <button
                            onClick={() => setShowRelayListInfoModal(true)}
                            className="info-button"
                            title="Learn more about relay lists"
                        >
                            <InformationCircleIcon />
                        </button>
                    </div>

                    {relayList.length === 0 && (
                        <p className="no-relays">No relay list configured. Add some relays below or sync from preferred relays.</p>
                    )}

                    <div className="add-relay-form">
                        <div className="form-row">
                            <input
                                type="text"
                                value={newRelayUrl}
                                onChange={(e) => setNewRelayUrl(e.target.value)}
                                placeholder="wss://relay.example.com"
                                className="relay-url-input"
                            />
                            <select
                                value={newRelayPolicy}
                                onChange={(e) => setNewRelayPolicy(e.target.value as 'read' | 'write' | 'readwrite')}
                                className="policy-select"
                            >
                                <option value="read">Read Only</option>
                                <option value="write">Write Only</option>
                                <option value="readwrite">Read & Write</option>
                            </select>
                            <button onClick={addRelayToList} className="add-button">
                                <PlusIcon />
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="relays-list">
                        {relayList.length > 0 && (
                            relayList.map((relay, index) => (
                                                                 <div key={index} className="relay-item">
                                     <div className="relay-info">
                                         <span className="relay-url">{relay.url}</span>
                                     </div>
                                     <div className="relay-controls">
                                         <div className="permission-toggles">
                                             <label className="permission-toggle">
                                                 <input
                                                     type="checkbox"
                                                     checked={relay.read}
                                                     onChange={(e) => updateRelayListPermissions(relay.url, e.target.checked, relay.write)}
                                                 />
                                                 Read
                                             </label>
                                             <label className="permission-toggle">
                                                 <input
                                                     type="checkbox"
                                                     checked={relay.write}
                                                     onChange={(e) => updateRelayListPermissions(relay.url, relay.read, e.target.checked)}
                                                 />
                                                 Write
                                             </label>
                                         </div>
                                         <div className="relay-actions">
                                             <button
                                                 onClick={() => handleTestRelayConnection(relay.url)}
                                                 disabled={isLoading}
                                                 className="test-button"
                                                 title="Test connection"
                                             >
                                                 Test
                                             </button>
                                             <button
                                                 onClick={() => removeRelayFromList(relay.url)}
                                                 className="remove-button"
                                                 title="Remove relay"
                                             >
                                                 <TrashIcon />
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                            ))
                        )}
                    </div>
                    
                    <div className="section-actions">
                        <button
                            onClick={publishRelayList}
                            className="save-button"
                            disabled={relayList.length === 0 || isPublishing}
                        >
                            {isPublishing ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </section>

                <section className="settings-section">
                    <div className="section-header">
                        <h2>Cache</h2>
                        <button
                            onClick={() => setShowCacheInfoModal(true)}
                            className="info-button"
                            title="Learn more about cache management"
                        >
                            <InformationCircleIcon />
                        </button>
                    </div>

                    <div className="cache-info">
                        <p>Available Storage: <strong>Browser managed</strong></p>
                        <p>Cache Entries: <strong>{cacheData.length}</strong></p>
                        <p>Total Cache Size: <strong>{Math.round(cacheData.reduce((sum, item) => sum + item.size, 0) / 1024)}KB</strong></p>
                    </div>

                    <div className="cache-actions">
                        <button
                            onClick={runStorageCleanup}
                            className="cleanup-button"
                            title="Run automatic storage cleanup"
                        >
                            Run Cleanup
                        </button>
                        <button
                            onClick={clearAllCache}
                            className="clear-all-button"
                            title="Clear all cache data"
                        >
                            Clear All Cache
                        </button>
                        <button
                            onClick={loadCacheData}
                            className="refresh-button"
                            title="Refresh cache data"
                        >
                            Refresh
                        </button>
                    </div>

                    {cacheData.length > 0 ? (
                        <div className="cache-list">
                            <h3>Cache Entries</h3>
                            {cacheData.map((item, index) => (
                                <div key={index} className="cache-item">
                                    <div className="cache-item-info">
                                        <div className="cache-key">{item.key}</div>
                                        <div className="cache-size">{Math.round(item.size / 1024)}KB</div>
                                    </div>
                                    <div className="cache-item-actions">
                                        <button
                                            onClick={() => deleteCacheKey(item.key)}
                                            className="delete-cache-button"
                                            title={`Delete ${item.key}`}
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-cache">
                            <p>No cache data found.</p>
                        </div>
                    )}
                </section>

                <section className="settings-section">
                    <div className="section-header">
                        <h2>Custom Emojis ({customEmojis.length})</h2>
                        <ProFeature>
                            <button
                                onClick={() => setShowAddEmojiModal(true)}
                                className="add-emoji-button"
                                title="Add custom emoji"
                            >
                                <PlusIcon />
                            </button>
                        </ProFeature>
                    </div>

                    <ProFeature showUpgradePrompt={true}>
                        {isLoadingEmojis ? (
                            <div className="loading-emojis">
                                <div className="loading-spinner"></div>
                                <p>Loading custom emojis...</p>
                            </div>
                        ) : customEmojis.length === 0 ? (
                            <p className="no-emojis">No custom emojis configured. Add some emojis below.</p>
                        ) : (
                            <div className="emojis-list">
                                {customEmojis.map((emoji) => (
                                    <div key={`${emoji.npub}-${emoji.name}`} className="emoji-item">
                                        <div className="emoji-preview">
                                            <img 
                                                src={emoji.url} 
                                                alt={emoji.name}
                                                className="emoji-image"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                                }}
                                            />
                                            <div className="emoji-fallback hidden">❓</div>
                                        </div>
                                        <div className="emoji-info">
                                            <div className="emoji-name">{emoji.name}</div>
                                            <div className="emoji-url">{emoji.url}</div>
                                        </div>
                                        <div className="emoji-actions">
                                            <button
                                                onClick={() => handleRemoveCustomEmoji(emoji.name)}
                                                className="remove-emoji-button"
                                                title="Remove emoji"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ProFeature>
                </section>

                <section className="settings-section">
                    <div className="section-header">
                        <h2>Backup ({backupPosts.length})</h2>
                        <ProFeature>
                            <button
                                onClick={loadBackupPosts}
                                className="refresh-button"
                                title="Refresh posts list"
                                disabled={isLoadingBackup}
                            >
                                {isLoadingBackup ? 'Loading...' : 'Refresh'}
                            </button>
                        </ProFeature>
                    </div>

                    <ProFeature showUpgradePrompt={true}>
                        {isLoadingBackup ? (
                            <div className="loading-backup">
                                <div className="loading-spinner"></div>
                                <p>Loading your posts...</p>
                            </div>
                        ) : backupPosts.length === 0 ? (
                            <p className="no-posts">No published posts found. Create and publish some posts to backup them.</p>
                        ) : (
                            <>
                                <div className="backup-controls">
                                    <div className="selection-controls">
                                        <button
                                            onClick={selectAllPosts}
                                            className="select-all-button"
                                            disabled={selectedPosts.size === backupPosts.length}
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={deselectAllPosts}
                                            className="deselect-all-button"
                                            disabled={selectedPosts.size === 0}
                                        >
                                            Deselect All
                                        </button>
                                        <span className="selection-count">
                                            {selectedPosts.size} of {backupPosts.length} selected
                                        </span>
                                    </div>
                                </div>

                                <div className="backup-posts-list">
                                    {backupPosts.map((post) => (
                                        <div key={post.id} className="backup-post-item">
                                            <div className="post-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPosts.has(post.id)}
                                                    onChange={() => togglePostSelection(post.id)}
                                                    id={`post-${post.id}`}
                                                />
                                                <label htmlFor={`post-${post.id}`} className="checkbox-label">
                                                    <div className="post-info">
                                                        <div className="post-title">{post.title}</div>
                                                        <div className="post-meta">
                                                            {new Date(post.created_at * 1000).toLocaleDateString()} • 
                                                            {post.content.length} characters
                                                            {post.dTag && ` • ${post.dTag}`}
                                                        </div>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="backup-actions">
                                    <button
                                        onClick={createBackup}
                                        className="create-backup-button"
                                        disabled={selectedPosts.size === 0 || isCreatingBackup}
                                    >
                                        <DocumentArrowDownIcon />
                                        {isCreatingBackup ? 'Creating Backup...' : 'Create Backup'}
                                    </button>
                                </div>
                            </>
                        )}
                    </ProFeature>
                </section>


            </div>

            {/* Info Modal */}
            {showInfoModal && (
                <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>About Preferred Relays</h3>
                            <button
                                onClick={() => setShowInfoModal(false)}
                                className="modal-close-button"
                                title="Close"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>
                                According to {' '}<a
                                    href="https://github.com/nostr-protocol/nips/blob/master/37.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="external-link"
                                >
                                    NIP-37
                                </a>, private events should be sent to a subset of relays that the user trusts.
                                These relays are used for:
                            </p>
                            <ul>
                                <li><strong>Read Only:</strong> Only receive private events from this relay</li>
                                <li><strong>Write Only:</strong> Only send private events to this relay</li>
                                <li><strong>Read & Write:</strong> Both send and receive private events with this relay</li>
                            </ul>
                            <p>
                                This setting only affects your draft events (kind 30024). Public events will continue to use your relay lists configuration.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Relay List Info Modal */}
            {showRelayListInfoModal && (
                <div className="modal-overlay" onClick={() => setShowRelayListInfoModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>About Relay Lists (NIP-65)</h3>
                            <button
                                onClick={() => setShowRelayListInfoModal(false)}
                                className="modal-close-button"
                                title="Close"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>
                                According to {' '}<a
                                    href="https://github.com/nostr-protocol/nips/blob/master/65.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="external-link"
                                >
                                    NIP-65
                                </a>, relay lists allow users to publish their preferred relays as a Nostr event (kind 10002).
                                This enables:
                            </p>
                            <ul>
                                <li><strong>Discovery:</strong> Other clients can discover your preferred relays</li>
                                <li><strong>Backup:</strong> Your relay preferences are stored on the Nostr network</li>
                                <li><strong>Sharing:</strong> You can share your relay list with others</li>
                                <li><strong>Sync:</strong> Your relay preferences sync across different devices</li>
                            </ul>
                            <p>
                                <strong>Read:</strong> Receive events from this relay<br/>
                                <strong>Write:</strong> Send events to this relay<br/>
                                <strong>Both:</strong> Both send and receive events with this relay
                            </p>
                            <p>
                                Publishing your relay list makes it available to other Nostr clients and helps build a more connected network.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Cache Info Modal */}
            {showCacheInfoModal && (
                <div className="modal-overlay" onClick={() => setShowCacheInfoModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>About Cache Management</h3>
                            <button
                                onClick={() => setShowCacheInfoModal(false)}
                                className="modal-close-button"
                                title="Close"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>
                                The cache stores various data to improve app performance and user experience:
                            </p>
                            <ul>
                                <li><strong>Posts:</strong> Cached blog posts and articles</li>
                                <li><strong>Author Profiles:</strong> User profile information</li>
                                <li><strong>Read Status:</strong> Which posts you&apos;ve read</li>
                                <li><strong>Drafts:</strong> Your unsaved draft content</li>
                                <li><strong>Relay Lists:</strong> Your preferred relay configurations</li>
                                <li><strong>Error Logs:</strong> Debug information for troubleshooting</li>
                            </ul>
                            <p>
                                <strong>Available Storage:</strong> Shows how much browser storage space is available<br/>
                                <strong>Run Cleanup:</strong> Automatically removes old data to free space<br/>
                                <strong>Clear All Cache:</strong> Removes all cached data (you&apos;ll need to reload content)<br/>
                                <strong>Delete Individual Keys:</strong> Remove specific cache entries
                            </p>
                            <p>
                                <strong>Note:</strong> Clearing cache will require the app to reload data from the Nostr network, which may take some time.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Emoji Modal */}
            {showAddEmojiModal && (
                <div className="modal-overlay" onClick={() => setShowAddEmojiModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add Custom Emoji</h3>
                            <button
                                onClick={() => setShowAddEmojiModal(false)}
                                className="modal-close-button"
                                title="Close"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="emoji-form">
                                <div className="form-group">
                                    <label htmlFor="emoji-name">Emoji Name</label>
                                    <input
                                        id="emoji-name"
                                        type="text"
                                        value={newEmojiName}
                                        onChange={(e) => setNewEmojiName(e.target.value)}
                                        placeholder="e.g., :custom_emoji:"
                                        className="emoji-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="emoji-url">Emoji URL</label>
                                    <input
                                        id="emoji-url"
                                        type="url"
                                        value={newEmojiUrl}
                                        onChange={(e) => setNewEmojiUrl(e.target.value)}
                                        placeholder="https://example.com/emoji.png"
                                        className="emoji-input"
                                    />
                                </div>
                                <div className="emoji-preview-section">
                                    <label>Preview</label>
                                    <div className="emoji-preview-container">
                                        {newEmojiUrl && (
                                            <img 
                                                src={newEmojiUrl} 
                                                alt="Preview"
                                                className="emoji-preview-image"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                                }}
                                            />
                                        )}
                                        <div className="emoji-preview-fallback hidden">❓</div>
                                        {!newEmojiUrl && (
                                            <div className="emoji-preview-placeholder">Enter URL to see preview</div>
                                        )}
                                    </div>
                                </div>
                                <div className="emoji-form-actions">
                                    <button
                                        onClick={() => setShowAddEmojiModal(false)}
                                        className="cancel-button"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddCustomEmoji}
                                        className="add-emoji-submit-button"
                                        disabled={!newEmojiName.trim() || !newEmojiUrl.trim()}
                                    >
                                        Add Emoji
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
            )}
        </AuthGuard>
    );
} 