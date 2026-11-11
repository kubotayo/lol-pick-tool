// フロントエンド・バッチスクリプト両方で共有する定数と型
// この定数はSupabaseのカラム値と一致させること

export const LANES    = ['TOP', 'JG', 'MID', 'BOT', 'SUP'] as const;
export const REGIONS  = ['JP', 'KR', 'NA', 'EUW', 'EUNE'] as const;
export const TIERS    = ['all', 'platinum_plus', 'diamond_plus', 'master_plus'] as const;

export type Lane   = typeof LANES[number];
export type Region = typeof REGIONS[number];
export type Tier   = typeof TIERS[number];

// 最低試合数の既定値（API設計書 05）。上のランク帯ほどデータがたまりにくいため、データ量の比率（1 : 1/2 : 1/4）に合わせて下げる
export const DEFAULT_MIN_GAMES: Record<'champions' | 'counter', Record<Tier, number>> = {
  champions: { all: 100, platinum_plus: 100, diamond_plus: 50,  master_plus: 30 },
  counter:   { all: 200, platinum_plus: 200, diamond_plus: 100, master_plus: 50 },
};
