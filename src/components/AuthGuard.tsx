'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNostr } from '@/contexts/NostrContext';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireConnection?: boolean;
}

export function AuthGuard({ children, requireAuth = true, requireConnection = false }: AuthGuardProps) {
  const { isAuthenticated, isConnected, isLoading } = useNostr();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while loading
    if (isLoading) return;

    // If authentication is required and user is not authenticated, redirect to home
    if (requireAuth && !isAuthenticated) {
      console.log('🔒 AuthGuard: User not authenticated, redirecting to home');
      router.push('/');
      return;
    }
  }, [isAuthenticated, isConnected, isLoading, requireAuth, requireConnection, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="loading-fullscreen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If authentication is required and user is not authenticated, show a loading state
  // while redirecting (this prevents flash of content)
  if (requireAuth && !isAuthenticated) {
    return (
      <div className="loading-fullscreen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // If connection is required and user is not connected, show a connection message
  if (requireConnection && isAuthenticated && !isConnected) {
    return (
      <div className="loading-fullscreen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Connecting to Nostr network...</p>
          <p className="loading-subtext">Please wait while we establish a connection.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
} 