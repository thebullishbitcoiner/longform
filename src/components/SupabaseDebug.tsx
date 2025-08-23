'use client';

import { useState } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useSupabase } from '@/contexts/SupabaseContext';
import { checkProStatus } from '@/utils/supabase';
import { supabase } from '@/config/supabase';

export function SupabaseDebug() {
  const { currentUser } = useNostr();
  const { proStatus, isLoading, refreshProStatus } = useSupabase();
  const [debugResult, setDebugResult] = useState<string>('');

  const runDebug = async () => {
    if (!currentUser?.npub) {
      setDebugResult('No current user npub found');
      return;
    }

    try {
      setDebugResult('Running debug check...');
      
      // Test direct Supabase query with more details
      const result = await checkProStatus(currentUser.npub);
      
      // Also test a direct query to see all subscribers
      const { data: allSubscribers, error: allError } = await supabase
        .from('subscribers')
        .select('*');
      
      // Test exact match query
      const { data: exactMatch, error: exactError } = await supabase
        .from('subscribers')
        .select('*')
        .eq('npub', currentUser.npub);
      
      // Test if we can access the database at all
      const { data: testQuery, error: testError } = await supabase
        .from('subscribers')
        .select('count')
        .limit(1);
      
      setDebugResult(JSON.stringify({
        userNpub: currentUser.npub,
        userNpubLength: currentUser.npub.length,
        directCheckResult: result,
        contextProStatus: proStatus,
        isLoading,
        allSubscribers: allSubscribers || [],
        allSubscribersCount: allSubscribers?.length || 0,
        allError: allError?.message,
        exactMatch: exactMatch || [],
        exactMatchCount: exactMatch?.length || 0,
        exactError: exactError?.message,
        testQuery: testQuery,
        testError: testError?.message,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...` : 'undefined',
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      }, null, 2));
    } catch (error) {
      setDebugResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const addTestRecord = async () => {
    if (!currentUser?.npub) {
      setDebugResult('No current user npub found');
      return;
    }

    try {
      setDebugResult('Adding test record...');
      
      // Add a test record with today's date
      const { data, error } = await supabase
        .from('subscribers')
        .insert([
          {
            npub: currentUser.npub,
            last_payment: new Date().toISOString()
          }
        ])
        .select();

      if (error) {
        setDebugResult(`Error adding test record: ${error.message}`);
        return;
      }

      setDebugResult(`Test record added successfully! Data: ${JSON.stringify(data, null, 2)}`);
      
      // Refresh the PRO status
      await refreshProStatus();
      
    } catch (error) {
      setDebugResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateExistingRecord = async () => {
    if (!currentUser?.npub) {
      setDebugResult('No current user npub found');
      return;
    }

    try {
      setDebugResult('Updating existing record...');
      
      // Update the existing record with today's date
      const { data, error } = await supabase
        .from('subscribers')
        .update({ last_payment: new Date().toISOString() })
        .eq('npub', currentUser.npub)
        .select();

      if (error) {
        setDebugResult(`Error updating record: ${error.message}`);
        return;
      }

      setDebugResult(`Record updated successfully! Data: ${JSON.stringify(data, null, 2)}`);
      
      // Refresh the PRO status
      await refreshProStatus();
      
    } catch (error) {
      setDebugResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!currentUser) {
    return <div>Not logged in</div>;
  }

  return (
    <div style={{ 
      background: '#1a1a1a', 
      padding: '1rem', 
      margin: '1rem', 
      border: '1px solid #333',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <h3>Supabase Debug</h3>
      <p><strong>Current User NPUB:</strong> {currentUser.npub}</p>
      <p><strong>NPUB Length:</strong> {currentUser.npub.length}</p>
      <p><strong>Context Loading:</strong> {isLoading ? 'Yes' : 'No'}</p>
      <p><strong>Context PRO Status:</strong> {JSON.stringify(proStatus)}</p>
      <p><strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...` : 'undefined'}</p>
      <p><strong>Has Supabase Key:</strong> {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Yes' : 'No'}</p>
      
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button 
          onClick={runDebug}
          style={{
            background: '#8b5cf6',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Run Debug Check
        </button>
        
        <button 
          onClick={addTestRecord}
          style={{
            background: '#22c55e',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Add Test Record
        </button>

        <button 
          onClick={updateExistingRecord}
          style={{
            background: '#f59e0b',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Update Existing Record
        </button>
      </div>
      
      {debugResult && (
        <pre style={{ 
          background: '#000', 
          padding: '1rem', 
          overflow: 'auto',
          maxHeight: '400px',
          marginTop: '1rem'
        }}>
          {debugResult}
        </pre>
      )}
    </div>
  );
}
