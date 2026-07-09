"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function CalendarSync({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('You must be logged in to sync calendar.');
      }

      // Check if the provider_token is available
      const providerToken = session.provider_token;
      
      if (!providerToken) {
        throw new Error('Google Calendar access token not found. Please log out and log back in with Google to grant Calendar permissions.');
      }

      // Call our secure backend API to handle the fetching and inserting
      const response = await fetch('/api/sync-calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          provider_token: providerToken
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync calendar');
      }

      setSyncMessage({ type: 'success', text: `Successfully synced ${data.count} calendar events! (Found ${data.totalFetched} total in Google)` });
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err) {
      setSyncMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button 
        onClick={handleSync} 
        disabled={isSyncing}
        className="btn"
        style={{ 
          backgroundColor: '#eff6ff', 
          border: '1px solid #bfdbfe', 
          color: '#1d4ed8', 
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center'
        }}
      >
        {isSyncing ? '🔄 Syncing...' : '📅 Sync Google Calendar'}
      </button>
      
      {syncMessage && (
        <div style={{ 
          fontSize: '12px', 
          padding: '8px', 
          borderRadius: '4px',
          backgroundColor: syncMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: syncMessage.type === 'success' ? '#166534' : '#991b1b',
          textAlign: 'center'
        }}>
          {syncMessage.text}
        </div>
      )}
    </div>
  );
}
