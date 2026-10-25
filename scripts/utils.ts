// バッチスクリプト専用のユーティリティ関数
// フロントエンドからはインポートしないこと

// teamPosition（Riot API の値）→ レーン略称 への変換マップ
// UTILITY は SUP（サポート）として扱う
const POSITION_MAP: Record<string, string> = {
  TOP:     'TOP',
  JUNGLE:  'JG',
  MIDDLE:  'MID',
  BOTTOM:  'BOT',
  UTILITY: 'SUP',
};

/**
 * Riot API の teamPosition を DB 保存用のレーン略称に正規化する
 * 未知のポジション（"" など）は null を返す
 */
export function normalizePosition(pos: string): string | null {
  return POSITION_MAP[pos] ?? null;
}

/**
 * Riot API の gameVersion を パッチ番号（先頭2セグメント）に正規化する
 * 例: "14.21.619.9898" → "14.21"
 *
 * Data Dragon の versions.json と MATCH-V5 の gameVersion で
 * フォーマットが異なるため、このユーティリティで統一する
 */
export function normalizePatch(gameVersion: string): string {
  return gameVersion.split('.').slice(0, 2).join('.');
}

/**
 * 指定ミリ秒だけ待機する
 * Riot API のレート制限（100 req/2分 = 1.2秒/req）に合わせるため使用する
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * アイテム配列（item0〜item5）を正規化してカンマ区切りの文字列に変換する
 * - 0（空スロット）を除外
 * - ソートして順序を統一（異なる購入順を同一ビルドとして集計するため）
 * 例: [3153, 0, 3031, 6675, 0, 0] → "3031,3153,6675"
 */
export function normalizeItemIds(items: number[]): string {
  return items
    .filter(id => id > 0)
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * レスポンスが Riot API の 429（レート制限）エラーかを判定する
 */
export function is429Error(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('429') || err.message.includes('Rate limit');
  }
  return false;
}
