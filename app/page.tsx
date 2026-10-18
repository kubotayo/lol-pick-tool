import Link from 'next/link';
import AppHeader from '@/components/AppHeader';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16"
        style={{ background: '#0a0e1a' }}>
        <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#c89b3c' }}>
          Champion Selection Assistant
        </p>
        <h1 className="text-2xl font-bold text-white mb-2">何をしますか？</h1>
        <p className="text-sm mb-12" style={{ color: '#6b7280' }}>使用したい機能を選んでください</p>

        <div className="flex gap-5 flex-wrap justify-center">
          <Link href="/first-pick"
            className="flex flex-col items-center rounded-xl p-7 w-48 transition-all hover:scale-105"
            style={{ background: '#16213e', border: '2px solid #c89b3c' }}>
            <span className="text-4xl mb-3">⚔️</span>
            <span className="font-bold mb-2" style={{ color: '#c89b3c' }}>先出しピック</span>
            <span className="text-xs text-center leading-relaxed" style={{ color: '#9ca3af' }}>
              レーンを選んで<br />強いチャンピオンを確認
            </span>
          </Link>
          <Link href="/counter-pick"
            className="flex flex-col items-center rounded-xl p-7 w-48 transition-all hover:scale-105"
            style={{ background: '#16213e', border: '2px solid #374151' }}>
            <span className="text-4xl mb-3">🛡️</span>
            <span className="font-bold text-white mb-2">カウンターピック</span>
            <span className="text-xs text-center leading-relaxed" style={{ color: '#9ca3af' }}>
              相手を選んで<br />カウンターを確認
            </span>
          </Link>
        </div>

        <div className="mt-10 rounded-lg px-6 py-3 flex gap-6 items-center text-xs"
          style={{ background: '#111827' }}>
          <span style={{ color: '#4ade80' }}>● JP</span>
          <span style={{ color: '#9ca3af' }}>Patch 14.21</span>
          <span style={{ color: '#9ca3af' }}>Diamond+</span>
        </div>
      </main>
    </div>
  );
}
