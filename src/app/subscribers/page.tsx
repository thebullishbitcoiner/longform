"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { UserIcon, UsersIcon, ArrowPathIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { AuthGuard } from '@/components/AuthGuard';
import Image from 'next/image';
import styles from './page.module.css';

interface Subscriber {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  isPending?: boolean;
}

const SubscribersPage: React.FC = () => {
  const { ndk, isAuthenticated, currentUser, isConnected } = useNostr();
  const [isLoading, setIsLoading] = useState(true);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasSubscriptionList, setHasSubscriptionList] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [npubInput, setNpubInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch subscribers from kind 30000 events with "longform-subscribers" d tag
  const fetchSubscribers = useCallback(async () => {
    if (!ndk || !currentUser) return [];

    // Check if NDK is connected to relays
    if (!isConnected) {
      console.log('Subscribers: NDK not connected to relays, skipping fetch');
      return [];
    }

    try {
      console.log('Subscribers: Fetching subscribers for:', currentUser.pubkey);
      
      return new Promise<Subscriber[]>((resolve) => {
        const subscribersList: Subscriber[] = [];
        const seenPubkeys = new Set<string>(); // Track seen pubkeys to prevent duplicates
        let foundSubscriptionList = false;
        
        // Subscribe to kind 30000 events with "longform-subscribers" d tag
        const subscription = ndk.subscribe(
          { 
            kinds: [30000], 
            authors: [currentUser.pubkey],
            '#d': ['longform-subscribers'],
            limit: 100 
          },
          { closeOnEose: true }
        );

        subscription.on('event', (event: NDKEvent) => {
          try {
            console.log('Subscribers: Found subscriber event:', event.id);
            foundSubscriptionList = true; // We found the subscription list event
            
            // Extract p tags which contain the subscriber pubkeys
            const pTags = event.tags.filter((tag: string[]) => tag[0] === 'p');
            
            pTags.forEach((tag: string[]) => {
              const pubkey = tag[1];
              if (pubkey && !seenPubkeys.has(pubkey)) {
                seenPubkeys.add(pubkey);
                
                // Convert hex pubkey to npub format
                let npub = pubkey;
                try {
                  // We'll fetch the profile to get the npub, but for now use the pubkey
                  npub = pubkey;
                } catch (error) {
                  console.error('Error processing pubkey:', error);
                }
                
                const subscriber: Subscriber = {
                  pubkey: pubkey,
                  npub: npub
                };
                
                subscribersList.push(subscriber);
              }
            });
          } catch (error: unknown) {
            console.error('Subscribers: Error parsing subscriber event:', error);
          }
        });

        subscription.on('eose', async () => {
          clearTimeout(timeout);
          console.log('Subscribers: Found', subscribersList.length, 'subscriber pubkeys');
          
          // Check if we found any subscription list
          setHasSubscriptionList(foundSubscriptionList);
          
          // Fetch profiles for all subscribers
          const subscribersWithProfiles: Subscriber[] = [];
          
          for (const subscriber of subscribersList) {
            try {
              const ndkUser = ndk.getUser({ pubkey: subscriber.pubkey });
              const profile = await ndkUser.fetchProfile();
              
              // Convert hex pubkey to npub format using bech32
              let npub = subscriber.pubkey;
              try {
                const { bech32 } = await import('bech32');
                const words = bech32.toWords(Buffer.from(subscriber.pubkey, 'hex'));
                npub = bech32.encode('npub', words);
              } catch (error) {
                console.error('Error converting hex to npub:', error);
              }
              
              const subscriberWithProfile: Subscriber = {
                pubkey: subscriber.pubkey,
                npub: npub,
                name: profile?.name,
                displayName: profile?.displayName,
                picture: profile?.image,
                nip05: profile?.nip05
              };
              
              subscribersWithProfiles.push(subscriberWithProfile);
            } catch (error) {
              console.error('Error fetching profile for subscriber:', subscriber.pubkey, error);
              // Still add the subscriber even if profile fetch fails
              subscribersWithProfiles.push(subscriber);
            }
          }
          
          console.log('Subscribers: Final subscribers with profiles:', subscribersWithProfiles.length);
          resolve(subscribersWithProfiles);
        });

        subscription.on('close', () => {
          console.log('Subscribers: Subscription closed');
        });

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          console.log('Subscribers: Subscription timeout, resolving with current results');
          subscription.stop();
          setHasSubscriptionList(foundSubscriptionList);
          resolve(subscribersList);
        }, 10000); // 10 second timeout

        subscription.on('close', () => {
          clearTimeout(timeout);
        });

      });
    } catch (error: unknown) {
      console.error('Subscribers: Error fetching subscribers:', error);
      toast.error('Failed to fetch subscribers');
      return [];
    }
  }, [ndk, currentUser, isConnected]);

  // Load subscribers data
  const loadSubscribers = useCallback(async () => {
    if (!isAuthenticated || !currentUser) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const subscribersList = await fetchSubscribers();
      setSubscribers(subscribersList);
    } catch (error: unknown) {
      console.error('Subscribers: Error loading subscribers:', error);
      toast.error('Failed to load subscribers');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, currentUser, fetchSubscribers]);

  // Create subscription list
  const createSubscriptionList = useCallback(async () => {
    if (!ndk || !currentUser) return;

    // Check if NDK is connected to relays
    if (!isConnected) {
      toast.error('Not connected to Nostr relays. Please check your connection.');
      return;
    }

    setIsCreatingList(true);
    try {
      console.log('Subscribers: Creating subscription list...');
      
      const event = new NDKEvent(ndk);
      event.kind = 30000;
      event.content = '';
      event.tags = [
        ['d', 'longform-subscribers'],
        ['title', 'Longform Subscribers']
      ];

      await event.sign();
      await event.publish();
      
      console.log('Subscribers: Subscription list created successfully');
      setHasSubscriptionList(true);
      toast.success('Subscription list created successfully!');
      
      // Refresh the subscribers list
      await loadSubscribers();
    } catch (error: unknown) {
      console.error('Subscribers: Error creating subscription list:', error);
      toast.error('Failed to create subscription list');
    } finally {
      setIsCreatingList(false);
    }
  }, [ndk, currentUser, loadSubscribers, isConnected]);

  // Refresh subscribers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const subscribersList = await fetchSubscribers();
      setSubscribers(subscribersList);
      toast.success('Subscribers refreshed');
    } catch (error: unknown) {
      console.error('Subscribers: Error refreshing subscribers:', error);
      toast.error('Failed to refresh subscribers');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Add subscriber from modal
  const handleAddSubscriber = async () => {
    if (!npubInput.trim()) {
      toast.error('Please enter a valid npub');
      return;
    }

    if (!isConnected) {
      toast.error('Not connected to Nostr relays');
      return;
    }

    try {
      // Convert npub to pubkey
      const { bech32 } = await import('bech32');
      const { words } = bech32.decode(npubInput.trim());
      const pubkey = Buffer.from(bech32.fromWords(words)).toString('hex');

      // Check if subscriber already exists
      const existingSubscriber = subscribers.find(sub => sub.pubkey === pubkey);
      if (existingSubscriber) {
        toast.error('This subscriber is already in your list');
        return;
      }

      // Fetch profile for the new subscriber
      const ndkUser = ndk.getUser({ pubkey });
      const profile = await ndkUser.fetchProfile();

      const newSubscriber: Subscriber = {
        pubkey,
        npub: npubInput.trim(),
        name: profile?.name,
        displayName: profile?.displayName,
        picture: profile?.image,
        nip05: profile?.nip05,
        isPending: true
      };

      setSubscribers(prev => [...prev, newSubscriber]);
      setNpubInput('');
      setIsModalOpen(false);
      toast.success('Subscriber added (pending save)');
    } catch (error) {
      console.error('Error adding subscriber:', error);
      toast.error('Invalid npub format');
    }
  };

  // Save subscribers list to Nostr
  const handleSaveSubscribers = async () => {
    if (!ndk || !currentUser || !isConnected) {
      toast.error('Not connected to Nostr relays');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Subscribers: Saving subscribers list...');
      
      const event = new NDKEvent(ndk);
      event.kind = 30000;
      event.content = '';
      event.tags = [
        ['d', 'longform-subscribers'],
        ['title', 'Longform Subscribers']
      ];

      // Add all subscribers (both existing and pending) as p tags
      subscribers.forEach(subscriber => {
        event.tags.push(['p', subscriber.pubkey]);
      });

      await event.sign();
      await event.publish();
      
      console.log('Subscribers: Subscribers list saved successfully');
      
      // Remove pending status from all subscribers
      setSubscribers(prev => prev.map(sub => ({ ...sub, isPending: false })));
      
      toast.success('Subscribers list saved successfully!');
    } catch (error: unknown) {
      console.error('Subscribers: Error saving subscribers list:', error);
      toast.error('Failed to save subscribers list');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

  return (
    <AuthGuard>
      {isLoading ? (
        <main>
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading your subscribers...</p>
          </div>
        </main>
      ) : (
        <main>
          <div className={styles.subscribers}>
            <div className={styles['subscribers-header']}>
              <h1 className={styles['subscribers-title']}>Subscribers</h1>
              <p className={styles['subscribers-subtitle']}>
                People who have subscribed to your longform content
              </p>
              {!isConnected && (
                <div className={styles['connection-warning']}>
                  ⚠️ Not connected to Nostr relays. Some features may not work.
                </div>
              )}
            </div>

            {subscribers.length > 0 ? (
              <div className={styles['subscribers-list']}>
                <div className={styles['subscribers-list-header']}>
                  <div className={styles['subscribers-count']}>
                    <UsersIcon className={styles['count-icon']} />
                    <span>{subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}</span>
                  </div>
                  {hasSubscriptionList && isConnected && (
                    <div className={styles['action-buttons']}>
                      <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={styles['refresh-button']}
                        title="Refresh subscribers"
                      >
                        <ArrowPathIcon className={`${styles['refresh-icon']} ${isRefreshing ? styles.spinning : ''}`} />
                      </button>
                      <button 
                        onClick={() => setIsModalOpen(true)}
                        disabled={!isConnected}
                        className={styles['add-button']}
                        title="Add subscriber"
                      >
                        <PlusIcon className={styles['add-icon']} />
                      </button>
                    </div>
                  )}
                </div>
                
                <div className={styles['subscribers-grid']}>
                  {subscribers.map((subscriber) => (
                    <div key={subscriber.pubkey} className={styles['subscriber-card']}>
                      <div className={styles['subscriber-avatar']}>
                        {subscriber.picture ? (
                          <Image
                            src={subscriber.picture}
                            alt={subscriber.displayName || subscriber.name || 'Subscriber'}
                            width={48}
                            height={48}
                            className={styles['avatar-image']}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`${styles['avatar-placeholder']} ${subscriber.picture ? 'hidden' : ''}`}>
                          <UserIcon className={styles['placeholder-icon']} />
                        </div>
                      </div>
                      
                      <div className={styles['subscriber-info']}>
                        <div className={styles['subscriber-name-row']}>
                          <h3 className={styles['subscriber-name']}>
                            {subscriber.displayName || subscriber.name || 'Anonymous'}
                          </h3>
                          {subscriber.isPending && (
                            <div className={styles['pending-badge']}>Pending</div>
                          )}
                        </div>
                        <p className={styles['subscriber-npub']}>
                          {subscriber.npub.substring(0, 12)}...{subscriber.npub.substring(subscriber.npub.length - 11)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {subscribers.some(sub => sub.isPending) && (
                  <div className={styles['save-section']}>
                    <button 
                      onClick={handleSaveSubscribers}
                      disabled={isSaving || !isConnected}
                      className={styles['save-button']}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>
            ) : hasSubscriptionList ? (
              <div className={styles['no-subscribers']}>
                <UsersIcon className={styles['no-subscribers-icon']} />
                <h3>No subscribers yet</h3>
                <p>
                  When people subscribe to your longform content, they&apos;ll appear here.
                  Share your articles to start building your subscriber base!
                </p>
              </div>
            ) : (
              <div className={styles['no-subscription-list']}>
                <UsersIcon className={styles['no-subscribers-icon']} />
                <h3>No subscription list set up</h3>
                <p>
                  You don&apos;t currently have a subscription list configured. 
                  A NIP-51 list will be created to track your longform subscribers.
                </p>
                <button 
                  onClick={createSubscriptionList}
                  disabled={isCreatingList || !isConnected}
                  className={styles['create-list-button']}
                >
                  <PlusIcon className={styles['create-icon']} />
                  {isCreatingList ? 'Creating...' : 'Create Subscription List'}
                </button>
                {!isConnected && (
                  <p className={styles['connection-note']}>
                    Connect to Nostr relays to create a subscription list.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Add Subscriber Modal */}
          {isModalOpen && (
            <div className={styles['modal-overlay']}>
              <div className={styles['modal']}>
                <div className={styles['modal-header']}>
                  <h3>Add Subscriber</h3>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className={styles['modal-close']}
                  >
                    <XMarkIcon className={styles['close-icon']} />
                  </button>
                </div>
                
                <div className={styles['modal-content']}>
                  <p className={styles['modal-description']}>
                    Enter the npub of the person you want to add to your subscribers list.
                  </p>
                  
                  <div className={styles['input-group']}>
                    <input
                      type="text"
                      value={npubInput}
                      onChange={(e) => setNpubInput(e.target.value)}
                      placeholder="npub1..."
                      className={styles['npub-input']}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddSubscriber();
                        }
                      }}
                    />
                  </div>
                </div>
                
                <div className={styles['modal-actions']}>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className={styles['modal-cancel']}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAddSubscriber}
                    className={styles['modal-add']}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </AuthGuard>
  );
};

export default SubscribersPage;
