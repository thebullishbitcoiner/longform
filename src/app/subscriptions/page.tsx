'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { PlusIcon } from '@heroicons/react/24/outline';
import AddNpubModal from '@/components/AddNpubModal';
import SubscriptionItem from '@/components/SubscriptionItem';

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    const newSubscriptions = subscriptions.filter(sub => sub !== hexPubkey);
    localStorage.setItem('long_subscriptions', JSON.stringify(newSubscriptions));
    setSubscriptions(newSubscriptions);
    toast.success('Subscription removed');
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
    </div>
  );
} 