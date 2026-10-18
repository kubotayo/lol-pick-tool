import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LoL Pick Tool',
  description: 'League of Legends チャンピオンピック補助ツール',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
