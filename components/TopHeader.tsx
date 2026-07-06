"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function TopHeader({ onToggleMenu }: { onToggleMenu?: () => void }) {
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [userName, setUserName] = useState('USER');
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    // Set dynamic date
    const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setTimeout(() => {
      setCurrentDate(new Date().toLocaleDateString('en-GB', dateOptions));
    }, 0);

    // Fetch user details
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'USER';
        setUserName(name.toUpperCase());
      }
    });
  }, []);

  const handleEmergencyOverride = () => {
    setIsRecalculating(true);
    setTimeout(() => {
      setIsRecalculating(false);
      alert("Emergency re-balance triggered! Tasks have been adjusted.");
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '24px', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button className="hamburger-btn" onClick={onToggleMenu} aria-label="Toggle menu">
          ☰
        </button>
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
            GOOD MORNING, {userName}
          </h2>
          <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-sidebar-heading)', margin: 0 }}>
            {currentDate}
          </p>
        </div>
      </div>
      <button 
        className="btn btn-outline-red" 
        onClick={handleEmergencyOverride} 
        disabled={isRecalculating}
      >
        {isRecalculating ? 'Re-balancing...' : '🔄 Emergency Re-balance'}
      </button>
    </div>
  );
}
