'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PlusIcon, TrashIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import {
    isValidRelayUrl,
    testRelayConnection,
    type PreferredRelay
} from '@/utils/preferredRelays';
import {
    createRelayListEvent,
    parseRelayListEvent,
    convertPreferredToRelayInfo,
    type RelayInfo
} from '@/utils/relayList';
import toast from 'react-hot-toast';
import './page.css';



export default function SettingsPage() {
    const router = useRouter();
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
                    const networkRelays: PreferredRelay[] = [];
                    
                    // Parse relay tags from the event
                    latestEvent.tags.forEach(tag => {
                        if (tag[0] === 'r' && tag[1]) {
                            const url = tag[1];
                            const policy = (tag[2] as 'read' | 'write' | 'readwrite') || 'readwrite';
                            
                            networkRelays.push({
                                url,
                                policy
                            });
                        }
                    });
                    
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
        if (showInfoModal || showRelayListInfoModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        // Cleanup function to restore scrolling when component unmounts
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showInfoModal, showRelayListInfoModal]);

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
            
            await event.publish();
            toast.success('Relay list published to Nostr network');
        } catch (error) {
            console.error('Error publishing relay list:', error);
            toast.error('Failed to publish relay list');
        } finally {
            setIsPublishing(false);
        }
    };

    const syncFromPreferredRelays = () => {
        const relayInfos = convertPreferredToRelayInfo(preferredRelays);
        handleSaveRelayList(relayInfos);
        toast.success('Relay list synced from preferred relays');
    };

    const publishPreferredRelays = async () => {
        if (!currentUser?.pubkey || preferredRelays.length === 0) {
            toast.error('No preferred relays to publish');
            return;
        }

        setIsPublishing(true);
        try {
            // Create a NIP-37 preferred relays event (kind 30078)
            const event = new NDKEvent();
            event.kind = 30078; // NIP-37 preferred relays kind
            event.created_at = Math.floor(Date.now() / 1000);
            event.tags.push(['client', 'Longform._']);
            
            // Add relay tags with policies
            preferredRelays.forEach(relay => {
                event.tags.push(['r', relay.url, relay.policy]);
            });
            
            await event.publish();
            toast.success('Preferred relays published to Nostr network');
        } catch (error) {
            console.error('Error publishing preferred relays:', error);
            toast.error('Failed to publish preferred relays');
        } finally {
            setIsPublishing(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <main className="container">
                <div className="auth-required">
                    <h1>Settings</h1>
                    <p>Please log in to access settings.</p>
                    <button onClick={() => router.push('/')} className="back-button">
                        <ArrowLeftIcon />
                        Back to Home
                    </button>
                </div>
            </main>
        );
    }

    return (
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

                    {isLoading && (
                        <p className="loading-relays">Loading preferred relays from Nostr network...</p>
                    )}
                    {!isLoading && preferredRelays.length === 0 && (
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
                                        <span className={`policy-badge policy-${relay.policy}`}>
                                            {relay.policy === 'read' ? 'Read Only' :
                                                relay.policy === 'write' ? 'Write Only' : 'Read & Write'}
                                        </span>
                                    </div>
                                    <div className="relay-actions">
                                        <select
                                            value={relay.policy}
                                            onChange={(e) => updateRelayPolicy(relay.url, e.target.value as 'read' | 'write' | 'readwrite')}
                                            className="policy-select-small"
                                        >
                                            <option value="read">Read Only</option>
                                            <option value="write">Write Only</option>
                                            <option value="readwrite">Read & Write</option>
                                        </select>
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
                        <h2>Relay List</h2>
                        <button
                            onClick={() => setShowRelayListInfoModal(true)}
                            className="info-button"
                            title="Learn more about relay lists"
                        >
                            <InformationCircleIcon />
                        </button>
                    </div>

                    {isLoadingRelayList && (
                        <p className="loading-relays">Loading relay list from Nostr network...</p>
                    )}
                    {!isLoadingRelayList && relayList.length === 0 && (
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
                                Add to List
                            </button>
                        </div>
                    </div>

                    <div className="relays-list">
                        {relayList.length > 0 && (
                            relayList.map((relay, index) => (
                                <div key={index} className="relay-item">
                                    <div className="relay-info">
                                        <span className="relay-url">{relay.url}</span>
                                        <div className="permission-badges">
                                            {relay.read && <span className="permission-badge read">Read</span>}
                                            {relay.write && <span className="permission-badge write">Write</span>}
                                        </div>
                                    </div>
                                    <div className="relay-actions">
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
                            ))
                        )}
                    </div>
                    
                    <div className="section-actions">
                        <button
                            onClick={syncFromPreferredRelays}
                            className="sync-button"
                            disabled={preferredRelays.length === 0}
                        >
                            Sync from Preferred Relays
                        </button>
                        <button
                            onClick={publishRelayList}
                            className="save-button"
                            disabled={relayList.length === 0 || isPublishing}
                        >
                            {isPublishing ? 'Saving...' : 'Save'}
                        </button>
                    </div>
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
                                This setting only affects private events (kind 4). Public events will continue to use your default relay configuration.
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
        </main>
    );
} 