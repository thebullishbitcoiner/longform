'use client';

import { useEffect } from 'react';
import { setupGlobalErrorHandler } from '@/utils/errorHandler';

export function GlobalErrorHandler() {
  useEffect(() => {
    setupGlobalErrorHandler();
  }, []);

  return null; // This component doesn't render anything
} 