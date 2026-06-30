"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";

export default function SidebarUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!user) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 8px', borderTop: '1px solid #1f2937' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '16px' }}>
        {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <p style={{ color: 'white', margin: 0, fontSize: '14px', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          My Account
        </p>
        <p style={{ color: 'var(--text-sidebar)', margin: 0, fontSize: '11px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {user.email}
        </p>
      </div>
      <button 
        onClick={handleLogout}
        title="Sign Out"
        style={{ background: 'transparent', color: 'var(--text-sidebar)', fontSize: '16px', padding: '4px', cursor: 'pointer', border: 'none' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
      </button>
    </div>
  );
}
