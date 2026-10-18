export const LANES = ['TOP', 'JG', 'MID', 'BOT', 'SUP'] as const;
export const REGIONS = ['JP', 'KR', 'NA', 'EUW', 'EUNE'] as const;
export const TIERS = ['all', 'platinum_plus', 'diamond_plus', 'master_plus'] as const;

export type Lane = typeof LANES[number];
export type Region = typeof REGIONS[number];
export type Tier = typeof TIERS[number];

export interface Champion {
  champion_id: number;
  champion_name: string;
  champion_key: string;
  image_url: string;
}

export interface ChampionStatRow {
  win_rate: number;
  games_played: number;
  champions: Champion;
}

export interface CounterStatRow {
  win_rate: number;
  games_played: number;
  champions: Champion;
}

// S>=55%, A:53-55%, B:51-53%, C<51%
export type Tier_Label = 'S' | 'A' | 'B' | 'C';

export function getTierLabel(winRate: number): Tier_Label {
  if (winRate >= 0.55) return 'S';
  if (winRate >= 0.53) return 'A';
  if (winRate >= 0.51) return 'B';
  return 'C';
}

export function getWinRateColor(winRate: number): string {
  if (winRate >= 0.57) return 'text-green-400';
  if (winRate >= 0.53) return 'text-yellow-400';
  return 'text-red-400';
}

export function formatWinRate(winRate: number): string {
  return `${(winRate * 100).toFixed(1)}%`;
}

export function formatGames(games: number): string {
  return games.toLocaleString('ja-JP');
}
