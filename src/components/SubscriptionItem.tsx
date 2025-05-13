import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import { TrashIcon } from '@heroicons/react/24/outline';
import styles from './SubscriptionItem.module.css';
import { useNostr } from '@/contexts/NostrContext';

interface SubscriptionItemProps {
  hexPubkey: string;
  onRemove: (hexPubkey: string) => void;
}

export default function SubscriptionItem({ hexPubkey, onRemove }: SubscriptionItemProps) {
  const { ndk } = useNostr();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const x = useMotionValue(0);
  const controls = useAnimation();
  
  // Transform x position to opacity for the action indicator
  const rightOpacity = useTransform(x, [15, 30], [0, 1]);
  
  // Transform x position to scale for the card
  const scale = useTransform(x, [-100, 0, 100], [0.99, 1, 0.99]);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    // Initial check
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (ndk) {
        try {
          const user = ndk.getUser({ pubkey: hexPubkey });
          const profile = await user.fetchProfile();
          if (profile) {
            // Try to get the best available name
            const name = profile.displayName || profile.name || null;
            if (name) {
              setDisplayName(name);
            }
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      }
    };

    fetchProfile();
  }, [ndk, hexPubkey]);

  const handleDragEnd = async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isMobile) return;

    const threshold = 200;
    const velocity = info.velocity.x;
    
    if (info.offset.x > threshold || velocity > 1000) {
      await controls.start({ 
        x: 600,
        opacity: 0,
        transition: { duration: 0.15 }
      });
      onRemove(hexPubkey);
    } else {
      controls.start({ 
        x: 0,
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 25
        }
      });
    }
  };

  const npub = nip19.npubEncode(hexPubkey);

  return (
    <div className={styles.swipeContainer}>
      {isMobile && (
        <motion.div 
          className={styles.swipeAction}
          style={{ opacity: rightOpacity }}
          initial={{ opacity: 0 }}
        >
          Remove
        </motion.div>
      )}
      <motion.div
        drag={isMobile ? "x" : false}
        dragConstraints={{ left: -300, right: 300 }}
        dragElastic={0.2}
        dragDirectionLock
        dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, scale }}
        className={`${styles.subscriptionItem} ${!isMobile ? styles.desktopItem : ''}`}
      >
        <div className={styles.subscriptionInfo}>
          {displayName ? (
            <>
              <span className={styles.displayName}>{displayName}</span>
              <span className={styles.npub}>{npub}</span>
            </>
          ) : (
            <span className={styles.npub}>{npub}</span>
          )}
        </div>
        <button
          onClick={() => onRemove(hexPubkey)}
          className={styles.removeButton}
        >
          <TrashIcon className={styles.trashIcon} />
        </button>
      </motion.div>
    </div>
  );
} 