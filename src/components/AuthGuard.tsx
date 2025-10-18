'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNostr } from '@/contexts/NostrContext';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireConnection?: boolean;
}

export function AuthGuard({ children, requireAuth = true, requireConnection = false }: AuthGuardProps) {
  const { isAuthenticated, isConnected, isLoading, checkAuthentication } = useNostr();
  const router = useRouter();
  const [authCheckAttempted, setAuthCheckAttempted] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Don't redirect while loading
    if (isLoading) return;

    // If authentication is required and user is not authenticated, try to check authentication first
    if (requireAuth && !isAuthenticated && !authCheckAttempted) {
      console.log('🔒 AuthGuard: User not authenticated, attempting to check authentication...');
      console.log('🔒 AuthGuard: Current state - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'isConnected:', isConnected);
      setAuthCheckAttempted(true);
      
      // Set a timeout to prevent infinite waiting
      timeoutRef.current = setTimeout(() => {
        console.log('🔒 AuthGuard: Authentication timeout after 10 seconds, redirecting to home');
        router.push('/');
      }, 10000); // 10 second timeout
      
      // Give authentication a chance to complete by calling checkAuthentication
      checkAuthentication().then((authResult) => {
        console.log('🔒 AuthGuard: Authentication check completed with result:', authResult);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (!authResult) {
          console.log('🔒 AuthGuard: Authentication check failed, redirecting to home');
          router.push('/');
        }
      }).catch((error) => {
        console.error('🔒 AuthGuard: Error checking authentication:', error);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        router.push('/');
      });
      return;
    }
  }, [isAuthenticated, isConnected, isLoading, requireAuth, requireConnection, router, checkAuthentication, authCheckAttempted]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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