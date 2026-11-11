// フロントエンド専用の表示ユーティリティ関数
// バッチスクリプトからはインポートしないこと

import type { Tier_Label } from '@/lib/types';

// 設計書(01_requirements.html FR-06)の閾値に準拠
// S>=55% / A:53-55% / B:51-53% / C<51%
export function getTierLabel(winRate: number): Tier_Label {
  if (winRate >= 0.55) return 'S';
  if (winRate >= 0.53) return 'A';
  if (winRate >= 0.51) return 'B';
  return 'C';
}

// 57%以上=緑 / 53〜57%=黄 / 53%未満=赤
export function getWinRateColor(winRate: number): string {
  if (winRate >= 0.57) return 'text-green-400';
  if (winRate >= 0.53) return 'text-yellow-400';
  return 'text-red-400';
}

// 0〜1の小数を百分率文字列（小数点1桁）に変換する（例: 0.5741 → "57.4%"）
export function formatWinRate(winRate: number): string {
  return `${(winRate * 100).toFixed(1)}%`;
}

// 試合数を日本語ロケールのカンマ区切りに変換する（例: 12453 → "12,453"）
export function formatGames(games: number): string {
  return games.toLocaleString('ja-JP');
}
