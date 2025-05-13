'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { PlusIcon } from '@heroicons/react/24/outline';
import AddNpubModal from '@/components/AddNpubModal';
import ConfirmModal from '@/components/ConfirmModal';
import SubscriptionItem from '@/components/SubscriptionItem';

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [subscriptionToRemove, setSubscriptionToRemove] = useState<string | null>(null);

  useEffect(() => {
    // Load subscriptions from localStorage
    const savedSubscriptions = localStorage.getItem('long_subscriptions');
    if (savedSubscriptions) {
      setSubscriptions(JSON.parse(savedSubscriptions));
    }
  }, []);

  const handleAddNpub = (hexPubkey: string) => {
    // Save to localStorage
    const newSubscriptions = [...subscriptions, hexPubkey];
    localStorage.setItem('long_subscriptions', JSON.stringify(newSubscriptions));
    setSubscriptions(newSubscriptions);
  };

  const handleRemoveNpub = (hexPubkey: string) => {
    setSubscriptionToRemove(hexPubkey);
    setIsConfirmModalOpen(true);
  };

  const confirmRemoveNpub = () => {
    if (subscriptionToRemove) {
      const newSubscriptions = subscriptions.filter(sub => sub !== subscriptionToRemove);
      localStorage.setItem('long_subscriptions', JSON.stringify(newSubscriptions));
      setSubscriptions(newSubscriptions);
      
      // Clear posts from localStorage when subscription is removed
      const cachedPosts = localStorage.getItem('long_posts');
      if (cachedPosts) {
        const posts = JSON.parse(cachedPosts);
        const filteredPosts = posts.filter((post: any) => post.pubkey !== subscriptionToRemove);
        localStorage.setItem('long_posts', JSON.stringify(filteredPosts));
      }
      
      toast.success('Subscription removed');
      setIsConfirmModalOpen(false);
      setSubscriptionToRemove(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Subscriptions</h1>
          <button onClick={() => setIsModalOpen(true)} className={styles.addButton}>
            <PlusIcon className={styles.icon} />
            Add npub
          </button>
        </div>

        <div className={styles.subscriptionsList}>
          {subscriptions.map((hexPubkey) => (
            <SubscriptionItem
              key={hexPubkey}
              hexPubkey={hexPubkey}
              onRemove={handleRemoveNpub}
            />
          ))}
          {subscriptions.length === 0 && (
            <div className={styles.emptyState}>
              No subscriptions yet. Add an npub to get started!
            </div>
          )}
        </div>
      </div>

      <AddNpubModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddNpub}
        existingSubscriptions={subscriptions}
      />

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setSubscriptionToRemove(null);
        }}
        onConfirm={confirmRemoveNpub}
        title="Remove Subscription"
        message="Are you sure you want to remove this subscription?"
      />
    </div>
  );
} 