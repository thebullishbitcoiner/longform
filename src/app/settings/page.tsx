'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PlusIcon, TrashIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import {
    getPreferredRelays,
    savePreferredRelays,
    isValidRelayUrl,
    testRelayConnection,
    type PreferredRelay
} from '@/utils/preferredRelays';
import toast from 'react-hot-toast';
import './page.css';



export default function SettingsPage() {
    const router = useRouter();
    const { isAuthenticated, currentUser } = useNostr();
    const [preferredRelays, setPreferredRelays] = useState<PreferredRelay[]>([]);
    const [newRelayUrl, setNewRelayUrl] = useState('');
    const [newRelayPolicy, setNewRelayPolicy] = useState<'read' | 'write' | 'readwrite'>('readwrite');
    const [isLoading, setIsLoading] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

    const loadPreferredRelays = useCallback(() => {
        if (currentUser?.pubkey) {
            const relays = getPreferredRelays(currentUser.pubkey);
            setPreferredRelays(relays);
        }
    }, [currentUser?.pubkey]);

    // Load preferred relays from localStorage on component mount
    useEffect(() => {
        if (isAuthenticated && currentUser) {
            loadPreferredRelays();
        }
    }, [isAuthenticated, currentUser, loadPreferredRelays]);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (showInfoModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        // Cleanup function to restore scrolling when component unmounts
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showInfoModal]);

    const handleSavePreferredRelays = (relays: PreferredRelay[]) => {
        try {
            if (currentUser?.pubkey) {
                savePreferredRelays(currentUser.pubkey, relays);
                setPreferredRelays(relays);
                toast.success('Preferred relays saved');
            }
        } catch (error) {
            console.error('Error saving preferred relays:', error);
            toast.error('Failed to save preferred relays');
        }
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
        </main>
    );
} 