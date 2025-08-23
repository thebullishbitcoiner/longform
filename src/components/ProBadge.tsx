'use client';

import { StarIcon } from '@heroicons/react/24/solid';
import { useProStatus } from '@/hooks/useProStatus';

interface ProBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function ProBadge({ size = 'md', showText = false, className = '' }: ProBadgeProps) {
  const { isPro, isLoading } = useProStatus();

  if (isLoading) {
    return null;
  }

  if (!isPro) {
    return null;
  }

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <StarIcon className={`${sizeClasses[size]} text-yellow-400`} />
      {showText && (
        <span className={`${textSizeClasses[size]} font-medium text-yellow-400`}>
          PRO
        </span>
      )}
    </div>
  );
}
