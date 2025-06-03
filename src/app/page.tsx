'use client';

import DraftList from '@/components/DraftList';
import NostrLogin from '@/components/NostrLogin';
import styles from '@/components/NostrLogin.module.css';
import { NostrTest } from '@/components/NostrTest';

export default function Home() {
  return (
    <main className="container">
      <div className={styles.wrapper}>
        <NostrLogin />
      </div>
      <DraftList />
      <NostrTest />
    </main>
  );
}
