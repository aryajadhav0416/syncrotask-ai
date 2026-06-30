"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import SidebarUser from './SidebarUser';
import TopHeader from './TopHeader';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <main className="main-content" style={{ marginLeft: 0 }}>{children}</main>;
  }

  return (
    <div className="layout-wrapper">
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'space-between' }}>
        <div>
          <div className="logo-container">
            <div className="logo-icon">S</div>
            <div className="logo-text">
              SyncroTask AI
              <span className="logo-badge">AGENT V1.0</span>
            </div>
          </div>
          
          <div className="nav-heading">MENU</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
              <span style={{ fontSize: '18px' }}>⏱️</span> Dashboard
            </Link>
            <Link href="/projects" className={`nav-link ${pathname === '/projects' ? 'active' : ''}`}>
              <span style={{ fontSize: '18px' }}>📈</span> Projects & Tasks
            </Link>
            <Link href="/routines" className={`nav-link ${pathname === '/routines' ? 'active' : ''}`}>
              <span style={{ fontSize: '18px' }}>🛡️</span> Fixed Routines
            </Link>
            <Link href="/voice-nudges" className={`nav-link ${pathname === '/voice-nudges' ? 'active' : ''}`}>
              <span style={{ fontSize: '18px' }}>🔔</span> Voice Nudges
            </Link>
          </nav>
        </div>
        
        <SidebarUser />
      </aside>
      
      <main className="main-content">
        <TopHeader />
        {children}
      </main>
    </div>
  );
}
