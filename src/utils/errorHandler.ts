import { cleanupStorage } from './storage';

// Global error handler for QuotaExceededError
export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') return;

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('Global error handler: QuotaExceededError detected, attempting cleanup...');
      event.preventDefault(); // Prevent the default error handling
      
      try {
        cleanupStorage();
        console.log('Global error handler: Storage cleanup completed');
      } catch (cleanupError) {
        console.error('Global error handler: Failed to cleanup storage:', cleanupError);
      }
    }
  });

  // Handle regular errors
  window.addEventListener('error', (event) => {
    const error = event.error;
    
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('Global error handler: QuotaExceededError detected, attempting cleanup...');
      event.preventDefault(); // Prevent the default error handling
      
      try {
        cleanupStorage();
        console.log('Global error handler: Storage cleanup completed');
      } catch (cleanupError) {
        console.error('Global error handler: Failed to cleanup storage:', cleanupError);
      }
    }
  });
}

// Wrapper function for localStorage operations that handles QuotaExceededError
export function safeLocalStorageOperation<T>(
  operation: () => T,
  fallback: T,
  context: string = 'unknown'
): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn(`QuotaExceededError in ${context}, attempting cleanup...`);
      
      try {
        cleanupStorage();
        // Try the operation again after cleanup
        return operation();
      } catch (retryError) {
        console.error(`Failed to retry operation after cleanup in ${context}:`, retryError);
        return fallback;
      }
    }
    
    console.error(`Error in ${context}:`, error);
    return fallback;
  }
} 