'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Image from 'next/image';
import { PlusIcon, TrashIcon, InformationCircleIcon, XMarkIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import {
    isValidRelayUrl,
    testRelayConnection,
    createRelayListEvent,
    parseRelayListEvent,
    type RelayInfo
} from '@/utils/relayList';
import toast from 'react-hot-toast';
import { AuthGuard } from '@/components/AuthGuard';
import { cleanupStorage } from '@/utils/storage';
import { ProFeature } from '@/components/ProFeature';
import {
  loadCustomEmojiList,
  publishCustomEmojiList,
} from '@/nostr/customEmojis';
import { fetchEmojiSet, fetchEmojiSets, discoverEmojiSets, decodeEmojiSetReference } from '@/nostr/emojiSets';
import { hexToNpub } from '@/utils/nostr';
import { EmojiEntry, EmojiList, EmojiSet } from '@/types/emoji';
import { FEATURED_EMOJI_SETS } from '@/data/emojiSets';
import JSZip from 'jszip';
import { Nip07Signer } from '@/utils/nip07Signer';
import { loadPreferredRelays, publishPreferredRelays } from '@/nostr/preferredRelays';
import { fetchEventsBounded } from '@/utils/ndkFetch';
import {
    KIND_DELETION,
    KIND_LONGFORM_ARTICLE,
    KIND_RELAY_LIST,
} from '@/nostr/kinds';
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
    const { isAuthenticated, currentUser, ndk, refreshRelaySet } = useNostr();
    const [relayList, setRelayList] = useState<RelayInfo[]>([]);
    const [newRelayUrl, setNewRelayUrl] = useState('');
    const [newRelayPolicy, setNewRelayPolicy] = useState<'read' | 'write' | 'readwrite'>('readwrite');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingRelayList, setIsLoadingRelayList] = useState(false);
    const [showRelayListInfoModal, setShowRelayListInfoModal] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [preferredRelays, setPreferredRelays] = useState<string[]>([]);
    const [newPreferredRelayUrl, setNewPreferredRelayUrl] = useState('');
    const [isLoadingPreferredRelays, setIsLoadingPreferredRelays] = useState(false);
    const [isPublishingPreferredRelays, setIsPublishingPreferredRelays] = useState(false);
    const [showPreferredRelaysInfoModal, setShowPreferredRelaysInfoModal] = useState(false);
    const [cacheData, setCacheData] = useState<Array<{key: string, value: string, size: number}>>([]);
    const [showCacheInfoModal, setShowCacheInfoModal] = useState(false);
    const [emojiList, setEmojiList] = useState<EmojiList>({ setRefs: [], looseEmojis: [] });
    const [subscribedSets, setSubscribedSets] = useState<EmojiSet[]>([]);
    const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
    const [newEmojiName, setNewEmojiName] = useState('');
    const [newEmojiUrl, setNewEmojiUrl] = useState('');
    const [showAddEmojiModal, setShowAddEmojiModal] = useState(false);
    const [backupPosts, setBackupPosts] = useState<BackupPost[]>([]);
    const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
    const [isLoadingBackup, setIsLoadingBackup] = useState(false);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [featuredSets, setFeaturedSets] = useState<EmojiSet[]>([]);
    const [isLoadingFeaturedSets, setIsLoadingFeaturedSets] = useState(false);
    const [discoveredSets, setDiscoveredSets] = useState<EmojiSet[]>([]);
    const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false);
    const [discoveryFilter, setDiscoveryFilter] = useState('');
    const [referenceInput, setReferenceInput] = useState('');
    const [referenceDTag, setReferenceDTag] = useState('');
    const [isResolvingReference, setIsResolvingReference] = useState(false);
    const [referencePreview, setReferencePreview] = useState<EmojiSet | null>(null);
    const [selectedEmojiSet, setSelectedEmojiSet] = useState<EmojiSet | null>(null);
    const [selectedEmojis, setSelectedEmojis] = useState<Set<string>>(new Set());
    const [showEmojiSetModal, setShowEmojiSetModal] = useState(false);

    const loadRelayList = useCallback(async () => {
        if (currentUser?.pubkey) {
            setIsLoadingRelayList(true);
            try {
                const events = await fetchEventsBounded(ndk, {
                    kinds: [KIND_RELAY_LIST],
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

    // Load preferred relays (NIP-37 kind 10013) on component mount
    const loadPreferredRelaysFromNostr = useCallback(async () => {
        if (!currentUser?.pubkey || !(ndk?.signer instanceof Nip07Signer)) return;
        setIsLoadingPreferredRelays(true);
        try {
            const relays = await loadPreferredRelays(ndk, ndk.signer, currentUser.pubkey);
            setPreferredRelays(relays);
        } catch (error) {
            console.warn('Failed to fetch preferred relays from Nostr:', error);
            setPreferredRelays([]);
        } finally {
            setIsLoadingPreferredRelays(false);
        }
    }, [currentUser?.pubkey, ndk]);

    // Load relay list on component mount
    useEffect(() => {
        if (isAuthenticated && currentUser) {
            loadRelayList();
            loadPreferredRelaysFromNostr();
        }
    }, [isAuthenticated, currentUser, loadRelayList, loadPreferredRelaysFromNostr]);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (showRelayListInfoModal || showPreferredRelaysInfoModal || showCacheInfoModal || showAddEmojiModal || showEmojiSetModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        // Cleanup function to restore scrolling when component unmounts
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showRelayListInfoModal, showPreferredRelaysInfoModal, showCacheInfoModal, showAddEmojiModal, showEmojiSetModal]);

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
            await refreshRelaySet();
        } catch (error) {
            console.error('Error publishing relay list:', error);
            toast.error('Failed to publish relay list');
        } finally {
            setIsPublishing(false);
        }
    };

    // Draft storage relays (NIP-37 kind 10013) functions
    const addPreferredRelay = () => {
        if (!newPreferredRelayUrl.trim()) {
            toast.error('Please enter a relay URL');
            return;
        }
        if (!isValidRelayUrl(newPreferredRelayUrl)) {
            toast.error('Please enter a valid relay URL (must start with wss:// or ws://)');
            return;
        }
        if (preferredRelays.includes(newPreferredRelayUrl.trim())) {
            toast.error('This relay is already in your draft storage list');
            return;
        }
        setPreferredRelays([...preferredRelays, newPreferredRelayUrl.trim()]);
        setNewPreferredRelayUrl('');
    };

    const removePreferredRelay = (url: string) => {
        setPreferredRelays(preferredRelays.filter(r => r !== url));
    };

    const publishPreferredRelaysToNostr = async () => {
        if (!currentUser?.pubkey || !(ndk?.signer instanceof Nip07Signer) || preferredRelays.length === 0) {
            toast.error('No preferred relays to publish');
            return;
        }

        setIsPublishingPreferredRelays(true);
        try {
            await publishPreferredRelays(ndk, ndk.signer, currentUser.pubkey, preferredRelays);
            toast.success('Draft storage relays published to Nostr network (NIP-44 encrypted)');
        } catch (error) {
            console.error('Error publishing preferred relays:', error);
            toast.error('Failed to publish preferred relays');
        } finally {
            setIsPublishingPreferredRelays(false);
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

    // Load the user's NIP-51 kind-10030 emoji list, then resolve the subscribed sets for display
    const loadCustomEmojisFromNostr = useCallback(async () => {
        if (!currentUser?.pubkey || !ndk) return;

        setIsLoadingEmojis(true);
        try {
            const list = await loadCustomEmojiList(ndk, currentUser.pubkey);
            setEmojiList(list);
            const sets = await fetchEmojiSets(ndk, list.setRefs);
            setSubscribedSets(sets);
        } catch (error) {
            console.error('Error loading custom emojis:', error);
            toast.error('Failed to load custom emojis');
        } finally {
            setIsLoadingEmojis(false);
        }
    }, [currentUser?.pubkey, ndk]);

    // Load custom emojis on component mount
    useEffect(() => {
        if (isAuthenticated && currentUser?.pubkey) {
            loadCustomEmojisFromNostr();
        }
    }, [isAuthenticated, currentUser?.pubkey, loadCustomEmojisFromNostr]);

    // Resolve the featured emoji sets live from relays (never trust a stale local copy)
    const loadFeaturedSets = useCallback(async () => {
        if (!ndk) return;
        setIsLoadingFeaturedSets(true);
        try {
            const sets = await fetchEmojiSets(ndk, FEATURED_EMOJI_SETS);
            setFeaturedSets(sets);
        } catch (error) {
            console.error('Error loading featured emoji sets:', error);
            toast.error('Failed to load emoji sets');
        } finally {
            setIsLoadingFeaturedSets(false);
        }
    }, [ndk]);

    // Best-effort browse of whatever emoji sets the discovery relays are carrying
    const loadDiscoveredSets = useCallback(async () => {
        if (!ndk) return;
        setIsLoadingDiscovery(true);
        try {
            const sets = await discoverEmojiSets(ndk);
            setDiscoveredSets(sets);
        } catch (error) {
            console.error('Error discovering emoji sets:', error);
        } finally {
            setIsLoadingDiscovery(false);
        }
    }, [ndk]);

    // Load the featured/discover catalog once the Add Emoji modal is opened
    useEffect(() => {
        if (showAddEmojiModal) {
            loadFeaturedSets();
            loadDiscoveredSets();
        }
    }, [showAddEmojiModal, loadFeaturedSets, loadDiscoveredSets]);

    // Backup functions
    const loadBackupPosts = useCallback(async () => {
        if (!currentUser?.pubkey || !ndk) return;

        setIsLoadingBackup(true);
        try {
            // Fetch user's published posts (kind 30023)
            const postsQuery = await fetchEventsBounded(ndk, {
                kinds: [KIND_LONGFORM_ARTICLE],
                authors: [currentUser.pubkey],
                limit: 100,
            });

            // Fetch deletion events (kind 5) to filter out deleted posts
            const deletionQuery = await fetchEventsBounded(ndk, {
                kinds: [KIND_DELETION],
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

    const handleUnsubscribeSet = async (set: EmojiSet) => {
        if (!currentUser?.pubkey || !ndk?.signer) {
            toast.error('User not authenticated');
            return;
        }

        try {
            const next: EmojiList = {
                setRefs: emojiList.setRefs.filter((r) => !(r.pubkey === set.pubkey && r.dTag === set.dTag)),
                looseEmojis: emojiList.looseEmojis,
            };
            await publishCustomEmojiList(ndk, next);
            setEmojiList(next);
            setSubscribedSets((prev) => prev.filter((s) => !(s.pubkey === set.pubkey && s.dTag === set.dTag)));
            toast.success(`Unsubscribed from "${set.title}"`);
        } catch (error) {
            console.error('Error unsubscribing from emoji set:', error);
            toast.error('Failed to unsubscribe from emoji set');
        }
    };

    const handleRemoveLooseEmoji = async (name: string) => {
        if (!currentUser?.pubkey || !ndk?.signer) {
            toast.error('User not authenticated');
            return;
        }

        try {
            const next: EmojiList = {
                setRefs: emojiList.setRefs,
                looseEmojis: emojiList.looseEmojis.filter((emoji) => emoji.name !== name),
            };
            await publishCustomEmojiList(ndk, next);
            setEmojiList(next);
            toast.success('Custom emoji removed');
        } catch (error) {
            console.error('Error removing custom emoji:', error);
            toast.error('Failed to remove custom emoji');
        }
    };

    const handleAddIndividualEmoji = async (e: FormEvent) => {
        e.preventDefault();
        if (!currentUser?.pubkey || !ndk?.signer) {
            toast.error('User not authenticated');
            return;
        }

        const name = newEmojiName.trim();
        const url = newEmojiUrl.trim();
        if (!name || !url) {
            toast.error('Enter both a shortcode and an image URL');
            return;
        }
        if (emojiList.looseEmojis.some((emoji) => emoji.name === name)) {
            toast.error(`"${name}" is already in your list`);
            return;
        }

        try {
            const next: EmojiList = {
                setRefs: emojiList.setRefs,
                looseEmojis: [{ name, url }, ...emojiList.looseEmojis],
            };
            await publishCustomEmojiList(ndk, next);
            setEmojiList(next);
            setNewEmojiName('');
            setNewEmojiUrl('');
            toast.success('Custom emoji added');
        } catch (error) {
            console.error('Error adding custom emoji:', error);
            toast.error('Failed to add custom emoji');
        }
    };

    // Emoji set functions

    const openEmojiSet = (emojiSet: EmojiSet) => {
        setSelectedEmojiSet(emojiSet);
        setSelectedEmojis(new Set());
        setShowAddEmojiModal(false); // Close the add emoji modal
        setShowEmojiSetModal(true);
    };

    const toggleEmojiSelection = (emojiName: string) => {
        setSelectedEmojis(prev => {
            const newSet = new Set(prev);
            if (newSet.has(emojiName)) {
                newSet.delete(emojiName);
            } else {
                newSet.add(emojiName);
            }
            return newSet;
        });
    };

    const selectAllEmojis = () => {
        if (selectedEmojiSet) {
            setSelectedEmojis(new Set(selectedEmojiSet.emojis.map(emoji => emoji.name)));
        }
    };

    const deselectAllEmojis = () => {
        setSelectedEmojis(new Set());
    };

    const isSetAlreadySubscribed = (set: EmojiSet) =>
        emojiList.setRefs.some((r) => r.pubkey === set.pubkey && r.dTag === set.dTag);

    const addSelectedEmojis = async () => {
        if (!currentUser?.pubkey || !ndk?.signer || !selectedEmojiSet || selectedEmojis.size === 0) {
            toast.error('Please select at least one emoji');
            return;
        }

        try {
            const wholeSetSelected = selectedEmojis.size === selectedEmojiSet.emojis.length;

            if (wholeSetSelected) {
                if (isSetAlreadySubscribed(selectedEmojiSet)) {
                    toast.error('You already have this set');
                    return;
                }
                const next: EmojiList = {
                    setRefs: [...emojiList.setRefs, { pubkey: selectedEmojiSet.pubkey, dTag: selectedEmojiSet.dTag }],
                    looseEmojis: emojiList.looseEmojis,
                };
                await publishCustomEmojiList(ndk, next);
                setEmojiList(next);
                setSubscribedSets((prev) => [...prev, selectedEmojiSet]);
                toast.success(`Subscribed to "${selectedEmojiSet.title}"`);
            } else {
                const toAdd: EmojiEntry[] = [];
                for (const emojiName of selectedEmojis) {
                    const emoji = selectedEmojiSet.emojis.find((e) => e.name === emojiName);
                    if (emoji && !emojiList.looseEmojis.some((e) => e.name === emoji.name)) {
                        toAdd.push({ name: emoji.name, url: emoji.url });
                    }
                }

                if (toAdd.length === 0) {
                    toast.error('No new emojis were added (they may already exist)');
                    return;
                }

                const next: EmojiList = {
                    setRefs: emojiList.setRefs,
                    looseEmojis: [...toAdd, ...emojiList.looseEmojis],
                };
                await publishCustomEmojiList(ndk, next);
                setEmojiList(next);
                toast.success(`Added ${toAdd.length} emoji${toAdd.length > 1 ? 's' : ''} to your collection`);
            }

            setShowEmojiSetModal(false);
            setSelectedEmojis(new Set());
        } catch (error) {
            console.error('Error adding selected emojis:', error);
            toast.error('Failed to add selected emojis');
        }
    };

    const handlePreviewReference = async () => {
        if (!ndk) return;
        const ref = decodeEmojiSetReference(referenceInput, referenceDTag);
        if (!ref) {
            toast.error('Enter a valid naddr, or a pubkey/npub with a d-tag');
            return;
        }

        setIsResolvingReference(true);
        setReferencePreview(null);
        try {
            const set = await fetchEmojiSet(ndk, ref.pubkey, ref.dTag);
            if (!set) {
                toast.error('No emoji set found for that reference');
                return;
            }
            setReferencePreview(set);
        } catch (error) {
            console.error('Error resolving emoji set reference:', error);
            toast.error('Failed to resolve that reference');
        } finally {
            setIsResolvingReference(false);
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

    const filteredDiscoveredSets = discoveredSets.filter((set) => {
        const query = discoveryFilter.trim().toLowerCase();
        if (!query) return true;
        return set.title.toLowerCase().includes(query) || set.dTag.toLowerCase().includes(query);
    });

    const renderEmojiSetCard = (set: EmojiSet) => {
        const npub = hexToNpub(set.pubkey);
        const attribution = npub ? `${npub.slice(0, 12)}…${npub.slice(-4)}` : `${set.pubkey.slice(0, 8)}…`;
        return (
            <div
                key={`${set.pubkey}:${set.dTag}`}
                className="emoji-set-card"
                onClick={() => openEmojiSet(set)}
            >
                <div className="emoji-set-header">
                    <div className="emoji-set-title-section">
                        <h4 className="emoji-set-title">{set.title} <span className="emoji-set-creator">by {attribution}</span></h4>
                    </div>
                    <span className="emoji-count">{set.emojis.length} emojis</span>
                </div>
                <div className="emoji-set-preview">
                    {set.emojis.slice(0, 6).map((emoji, index) => (
                        <Image
                            key={index}
                            src={emoji.url}
                            alt={emoji.name}
                            width={24}
                            height={24}
                            sizes="24px"
                            unoptimized
                            className="emoji-preview-small"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    ))}
                    {set.emojis.length > 6 && (
                        <div className="emoji-more">+{set.emojis.length - 6}</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <AuthGuard>
            {isLoadingRelayList ? (
                <main className="container">
                    <div className="loading-content">
                        <div className="loading-spinner"></div>
                        <p className="loading-text">
                            {`Loading kind ${KIND_RELAY_LIST} (NIP-65 relay list)...`}
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
                        <p className="no-relays">No relay list configured. Add some relays below.</p>
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

                    <div className="relays-listbox" role="listbox" aria-label="Relay list">
                        {relayList.length > 0 && (
                            relayList.map((relay, index) => (
                                <div key={index} className="relay-item" role="option" aria-selected="false">
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
                        <h2>Preferred Relays ({preferredRelays.length})</h2>
                        <button
                            onClick={() => setShowPreferredRelaysInfoModal(true)}
                            className="info-button"
                            title="Learn more about preferred relays"
                        >
                            <InformationCircleIcon />
                        </button>
                    </div>

                    {!isLoadingPreferredRelays && preferredRelays.length === 0 && (
                        <p className="no-relays">No preferred relays configured — your NIP-65 write relays will be used automatically the first time you save a draft.</p>
                    )}

                    <div className="add-relay-form">
                        <div className="form-row">
                            <input
                                type="text"
                                value={newPreferredRelayUrl}
                                onChange={(e) => setNewPreferredRelayUrl(e.target.value)}
                                placeholder="wss://relay.example.com"
                                className="relay-url-input"
                            />
                            <button onClick={addPreferredRelay} className="add-button">
                                <PlusIcon />
                                Add
                            </button>
                        </div>
                    </div>

                    {preferredRelays.length > 0 && (
                        <div className="relays-listbox" role="listbox" aria-label="Draft storage relays list">
                            {preferredRelays.map((url, index) => (
                                <div key={index} className="relay-item" role="option" aria-selected="false">
                                    <div className="relay-info">
                                        <span className="relay-url">{url}</span>
                                    </div>
                                    <div className="relay-actions">
                                        <button
                                            onClick={() => handleTestRelayConnection(url)}
                                            disabled={isLoading}
                                            className="test-button"
                                            title="Test connection"
                                        >
                                            Test
                                        </button>
                                        <button
                                            onClick={() => removePreferredRelay(url)}
                                            className="remove-button"
                                            title="Remove relay"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="section-actions">
                        <button
                            onClick={publishPreferredRelaysToNostr}
                            className="save-button"
                            disabled={preferredRelays.length === 0 || isPublishingPreferredRelays}
                        >
                            {isPublishingPreferredRelays ? 'Saving...' : 'Save'}
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
                        <p>Total Cache Size: <strong>{(cacheData.reduce((sum, item) => sum + item.size, 0) / (1024 * 1024)).toFixed(2)}MB</strong></p>
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
                        <div className="cache-listbox" role="listbox" aria-label="Cache entries list">
                            {cacheData.map((item, index) => (
                                <div key={index} className="cache-item" role="option" aria-selected="false">
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
                        <h2>Custom Emojis</h2>
                    </div>

                    <div className="section-header">
                        <h3>Emoji Sets ({subscribedSets.length})</h3>
                        <button
                            onClick={() => setShowAddEmojiModal(true)}
                            className="add-emoji-button"
                            title="Browse emoji sets"
                        >
                            <PlusIcon />
                        </button>
                    </div>

                    {isLoadingEmojis ? (
                        <div className="loading-emojis">
                            <div className="loading-spinner"></div>
                            <p>Loading custom emojis...</p>
                        </div>
                    ) : subscribedSets.length === 0 ? (
                        <p className="no-emojis">No emoji sets yet. Click the + button to browse some.</p>
                    ) : (
                        <div className="emojis-listbox" role="listbox" aria-label="Subscribed emoji sets">
                            {subscribedSets.map((set) => (
                                <div key={`${set.pubkey}:${set.dTag}`} className="emoji-item" role="option" aria-selected="false">
                                    <div className="emoji-set-preview">
                                        {set.emojis.slice(0, 4).map((emoji, index) => (
                                            <Image
                                                key={index}
                                                src={emoji.url}
                                                alt={emoji.name}
                                                width={24}
                                                height={24}
                                                sizes="24px"
                                                className="emoji-preview-small"
                                                unoptimized
                                            />
                                        ))}
                                    </div>
                                    <div className="emoji-info">
                                        <div className="emoji-name">{set.title}</div>
                                        <div className="emoji-url">{set.emojis.length} emojis</div>
                                    </div>
                                    <div className="emoji-actions">
                                        <button
                                            onClick={() => handleUnsubscribeSet(set)}
                                            className="remove-emoji-button"
                                            title="Unsubscribe from this set"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="section-header">
                        <h3>Individual Emojis ({emojiList.looseEmojis.length})</h3>
                    </div>

                    {isLoadingEmojis ? null : emojiList.looseEmojis.length === 0 ? (
                        <p className="no-emojis">No individual emojis configured yet.</p>
                    ) : (
                        <div className="emojis-listbox" role="listbox" aria-label="Custom emojis list">
                            {emojiList.looseEmojis.map((emoji) => (
                                <div key={emoji.name} className="emoji-item" role="option" aria-selected="false">
                                    <div className="emoji-preview">
                                        <Image
                                            src={emoji.url}
                                            alt={emoji.name}
                                            width={32}
                                            height={32}
                                            sizes="32px"
                                            className="emoji-image"
                                            unoptimized
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
                                            onClick={() => handleRemoveLooseEmoji(emoji.name)}
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

                    <form className="emoji-form" onSubmit={handleAddIndividualEmoji}>
                        <input
                            type="text"
                            className="emoji-input"
                            placeholder="Shortcode (e.g. mycustomemoji)"
                            value={newEmojiName}
                            onChange={(e) => setNewEmojiName(e.target.value)}
                        />
                        <input
                            type="url"
                            className="emoji-input"
                            placeholder="Image URL"
                            value={newEmojiUrl}
                            onChange={(e) => setNewEmojiUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="add-emoji-submit-button"
                            disabled={!newEmojiName.trim() || !newEmojiUrl.trim()}
                        >
                            Add
                        </button>
                    </form>
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
                                        <div className="selection-buttons">
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
                                        </div>
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
                                </a>, relay lists allow users to publish their preferred relays as a Nostr event (kind {KIND_RELAY_LIST}).
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

            {/* Preferred Relays Info Modal */}
            {showPreferredRelaysInfoModal && (
                <div className="modal-overlay" onClick={() => setShowPreferredRelaysInfoModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>About Preferred Relays (NIP-37)</h3>
                            <button
                                onClick={() => setShowPreferredRelaysInfoModal(false)}
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
                                </a>, your drafts are stored as encrypted &quot;draft wraps&quot; that only you can read.
                                This list tells Longform (and other NIP-37-compatible clients) which relays hold those
                                encrypted drafts — separate from the public relays your published articles use.
                            </p>
                            <p>
                                If you don&apos;t configure this, Longform automatically uses your NIP-65 write relays
                                the first time you save a draft — most people never need to touch this.
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
                    <div className="modal-content emoji-sets-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add Custom Emojis</h3>
                            <button
                                onClick={() => setShowAddEmojiModal(false)}
                                className="modal-close-button"
                                title="Close"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="emoji-sets-modal-content">
                                <p className="modal-description">Featured emoji sets.</p>

                                {isLoadingFeaturedSets ? (
                                    <div className="loading-emoji-sets">
                                        <div className="loading-spinner"></div>
                                        <p>Loading emoji sets...</p>
                                    </div>
                                ) : featuredSets.length === 0 ? (
                                    <p className="no-emoji-sets">No emoji sets available.</p>
                                ) : (
                                    <div className="emoji-sets-grid">
                                        {featuredSets.map(renderEmojiSetCard)}
                                    </div>
                                )}

                                <div className="current-emojis-section">
                                    <h3>Add by reference</h3>
                                    <p className="modal-description">Paste an naddr, or an npub/pubkey with its d-tag.</p>
                                    <div className="emoji-form">
                                        <input
                                            type="text"
                                            className="emoji-input"
                                            placeholder="naddr1... or npub1.../pubkey"
                                            value={referenceInput}
                                            onChange={(e) => { setReferenceInput(e.target.value); setReferencePreview(null); }}
                                        />
                                        {!referenceInput.trim().startsWith('naddr1') && (
                                            <input
                                                type="text"
                                                className="emoji-input"
                                                placeholder="d-tag"
                                                value={referenceDTag}
                                                onChange={(e) => { setReferenceDTag(e.target.value); setReferencePreview(null); }}
                                            />
                                        )}
                                        <button
                                            type="button"
                                            className="add-emoji-submit-button"
                                            onClick={handlePreviewReference}
                                            disabled={isResolvingReference || !referenceInput.trim()}
                                        >
                                            {isResolvingReference ? 'Looking up…' : 'Preview'}
                                        </button>
                                    </div>
                                    {referencePreview && (
                                        <div className="emoji-sets-grid">
                                            {renderEmojiSetCard(referencePreview)}
                                        </div>
                                    )}
                                </div>

                                <div className="current-emojis-section">
                                    <h3>Discover</h3>
                                    <input
                                        type="text"
                                        className="emoji-input"
                                        placeholder="Filter by title…"
                                        value={discoveryFilter}
                                        onChange={(e) => setDiscoveryFilter(e.target.value)}
                                    />
                                    {isLoadingDiscovery ? (
                                        <div className="loading-emoji-sets">
                                            <div className="loading-spinner"></div>
                                            <p>Searching relays…</p>
                                        </div>
                                    ) : filteredDiscoveredSets.length === 0 ? (
                                        <p className="no-emoji-sets">No sets found. Discovery is best-effort and only reflects a couple of relays.</p>
                                    ) : (
                                        <div className="emoji-sets-grid">
                                            {filteredDiscoveredSets.map(renderEmojiSetCard)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Emoji Set Selection Modal */}
            {showEmojiSetModal && selectedEmojiSet && (
                <div className="modal-overlay" onClick={() => setShowEmojiSetModal(false)}>
                    <div className="modal-content emoji-set-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-header-left">
                                <button
                                    onClick={() => {
                                        setShowEmojiSetModal(false);
                                        setShowAddEmojiModal(true);
                                    }}
                                    className="modal-back-button"
                                    title="Back to emoji sets"
                                >
                                    ←
                                </button>
                                <h3>{selectedEmojiSet.title}</h3>
                            </div>
                            <button
                                onClick={() => setShowEmojiSetModal(false)}
                                className="modal-close-button"
                                title="Close"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="emoji-set-selection">
                                <div className="selection-controls">
                                    <div className="selection-buttons">
                                        <button
                                            onClick={selectAllEmojis}
                                            className="select-all-button"
                                            disabled={selectedEmojis.size === selectedEmojiSet.emojis.length}
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={deselectAllEmojis}
                                            className="deselect-all-button"
                                            disabled={selectedEmojis.size === 0}
                                        >
                                            Deselect All
                                        </button>
                                    </div>
                                    <span className="selection-count">
                                        {selectedEmojis.size} of {selectedEmojiSet.emojis.length} selected
                                    </span>
                                </div>

                                <div className="emoji-selection-grid">
                                    {selectedEmojiSet.emojis.map((emoji) => (
                                        <div 
                                            key={emoji.name} 
                                            className={`emoji-selection-item ${selectedEmojis.has(emoji.name) ? 'selected' : ''}`}
                                            onClick={() => toggleEmojiSelection(emoji.name)}
                                        >
                                            <Image
                                                src={emoji.url}
                                                alt={emoji.name}
                                                width={20}
                                                height={20}
                                                sizes="20px"
                                                className="emoji-selection-image"
                                                unoptimized
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                }}
                                            />
                                            <span className="emoji-selection-name">{emoji.name}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="emoji-selection-actions">
                                    <button
                                        onClick={() => setShowEmojiSetModal(false)}
                                        className="cancel-button"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={addSelectedEmojis}
                                        className="add-selected-emojis-button"
                                        disabled={selectedEmojis.size === 0}
                                    >
                                        <PlusIcon />
                                        Add Selected ({selectedEmojis.size})
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