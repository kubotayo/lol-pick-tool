'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header style={{ background: 'linear-gradient(90deg, #0a0e1a, #16213e)', borderBottom: '2px solid #c89b3c' }}
      className="flex items-center justify-between px-5 py-3">
      <Link href="/" className="text-base font-bold tracking-wider"
        style={{ color: '#c89b3c' }}>
        LoL <span className="text-white">PICK</span> TOOL
      </Link>
      <nav className="flex gap-2">
        <Link href="/first-pick"
          className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors"
          style={pathname === '/first-pick'
            ? { background: '#c89b3c', borderColor: '#c89b3c', color: '#1a1a2e' }
            : { background: 'transparent', borderColor: '#374151', color: '#9ca3af' }}>
          先出しピック
        </Link>
        <Link href="/counter-pick"
          className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors"
          style={pathname.startsWith('/counter-pick')
            ? { background: '#c89b3c', borderColor: '#c89b3c', color: '#1a1a2e' }
            : { background: 'transparent', borderColor: '#374151', color: '#9ca3af' }}>
          カウンター
        </Link>
      </nav>
    </header>
  );
}
