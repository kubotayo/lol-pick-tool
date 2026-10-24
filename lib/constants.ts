// フロントエンド・バッチスクリプト両方で共有する定数と型
// この定数はSupabaseのカラム値と一致させること

export const LANES    = ['TOP', 'JG', 'MID', 'BOT', 'SUP'] as const;
export const REGIONS  = ['JP', 'KR', 'NA', 'EUW', 'EUNE'] as const;
export const TIERS    = ['all', 'platinum_plus', 'diamond_plus', 'master_plus'] as const;

export type Lane   = typeof LANES[number];
export type Region = typeof REGIONS[number];
export type Tier   = typeof TIERS[number];
