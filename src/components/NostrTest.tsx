'use client';

import { useNostr } from '@/contexts/NostrContext';
import { useEffect, useState } from 'react';

export function NostrTest() {
  // Only render in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const { ndk, isLoading } = useNostr();
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    const testNDK = async () => {
      console.log('Test component: isLoading =', isLoading);
      if (isLoading) {
        setTestResult('Waiting for NDK to initialize...');
        return;
      }

      try {
        console.log('Starting NDK tests...');
        setTestResult('Starting tests...\n');

        // Test 1: Check connected relays
        console.log('Checking connected relays...');
        const connectedRelays = ndk.pool.connectedRelays();
        console.log('Connected relays:', connectedRelays);
        
        if (connectedRelays.length === 0) {
          throw new Error('No relays are connected');
        }

        setTestResult(prev => prev + `\nConnected to ${connectedRelays.length} relays:\n${connectedRelays.map(r => r.url).join('\n')}`);

        // Test 2: Subscribe to some recent notes
        console.log('Setting up subscription...');
        const subscription = ndk.subscribe(
          { kinds: [1], limit: 5 },
          { closeOnEose: true },
          {
            onEvent: (event) => {
              console.log('Received event:', event.id);
              setTestResult(prev => prev + `\nReceived event: ${event.id}`);
            },
            onEose: () => {
              console.log('Subscription EOSE received');
              setTestResult(prev => prev + '\nSubscription completed (EOSE)');
            }
          }
        );

        // Cleanup subscription after 10 seconds
        setTimeout(() => {
          console.log('Stopping subscription...');
          subscription.stop();
          setTestResult(prev => prev + '\nTest completed');
        }, 10000);

      } catch (error) {
        console.error('Test error:', error);
        setTestResult(prev => prev + `\nError: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    testNDK();
  }, [ndk, isLoading]);

  if (isLoading) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">NDK Test Results</h2>
        <div className="bg-gray-100 p-4 rounded">
          Loading NDK... Please check browser console for details.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">NDK Test Results</h2>
      <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap">
        {testResult || 'Running tests...'}
      </pre>
    </div>
  );
} 