'use client';

import { ReactNode } from 'react';
import { useProStatus } from '@/hooks/useProStatus';
import { StarIcon } from '@heroicons/react/24/outline';
import './ProFeature.css';

interface ProFeatureProps {
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
}

export function ProFeature({ 
  children, 
  fallback = null, 
  showUpgradePrompt = false 
}: ProFeatureProps) {
  const { isPro, isLoading } = useProStatus();

  if (isLoading) {
    return <div className="pro-feature-loading">Loading...</div>;
  }

  if (isPro) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showUpgradePrompt) {
    return (
      <div className="pro-feature-upgrade">
        <div className="pro-feature-upgrade-content">
          <StarIcon className="pro-feature-icon" />
          <h3>PRO Feature</h3>
          <p>This feature is only available to PRO subscribers.</p>
          <a 
            href="/support" 
            className="pro-feature-upgrade-button"
          >
            Upgrade to PRO
          </a>
        </div>
      </div>
    );
  }

  return null;
}
