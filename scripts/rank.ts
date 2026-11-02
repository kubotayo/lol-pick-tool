// 試合のランク判定に使う関数（DB設計書「Riot API の値からの変換」rank_tier）
// ランクを数値（ポイント）にし、試合に出た10人の平均でその試合のランク帯を決める

// 試合を集める対象のランク（MASTER は Master・Grandmaster・Challenger をまとめたもの）
export const COLLECT_TIERS = ['PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'] as const;
export type CollectTier = typeof COLLECT_TIERS[number];

// 低い順。1ランク 400 ポイント（4段階 × 100）
const TIER_ORDER = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND',
  'MASTER', 'GRANDMASTER', 'CHALLENGER',
] as const;
const POINTS_PER_TIER = 400;
const DIVISION_OFFSET: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };

// 各ランクの下限ポイント
const PLATINUM_POINTS = 4 * POINTS_PER_TIER; // 1600
const EMERALD_POINTS  = 5 * POINTS_PER_TIER; // 2000
const DIAMOND_POINTS  = 6 * POINTS_PER_TIER; // 2400
const MASTER_POINTS   = 7 * POINTS_PER_TIER; // 2800

// Master 以上は段階がなく LP だけで決まる。LP は上限がなく、1人の高い LP が平均を大きく動かすため 400 で打ち切る
const APEX_LP_CAP = 400;

// 名簿（Platinum 以上）にいないプレイヤーは Gold 相当として扱う（Gold II 50LP = 1450）
export const UNKNOWN_PLAYER_POINTS = 3 * POINTS_PER_TIER + 200 + 50;

/**
 * ランク（tier・division・LP）をポイントに変換する
 * 例: PLATINUM IV 0LP → 1600 / DIAMOND I 50LP → 2750 / MASTER 120LP → 2920
 * 不明な tier・division なら null を返す
 */
export function rankToPoints(tier: string, division: string, leaguePoints: number): number | null {
  const index = (TIER_ORDER as readonly string[]).indexOf(tier);
  if (index === -1) return null;

  const lp = Math.max(0, leaguePoints);
  if (index >= TIER_ORDER.indexOf('MASTER')) {
    return MASTER_POINTS + Math.min(lp, APEX_LP_CAP);
  }

  const offset = DIVISION_OFFSET[division];
  if (offset === undefined) return null;
  return index * POINTS_PER_TIER + offset + Math.min(lp, 99);
}

/** ポイントを収集対象のランクに変換する。Platinum 未満なら null */
export function pointsToCollectTier(points: number): CollectTier | null {
  if (points >= MASTER_POINTS)   return 'MASTER';
  if (points >= DIAMOND_POINTS)  return 'DIAMOND';
  if (points >= EMERALD_POINTS)  return 'EMERALD';
  if (points >= PLATINUM_POINTS) return 'PLATINUM';
  return null;
}

/**
 * 試合の平均ポイントから、その試合を加算するランク帯（rank_tier の値）を返す
 * _plus は「そのランク以上」を含むため、上のランクの試合ほど多くのランク帯に加算される
 * 例: 平均 Diamond → ['all', 'platinum_plus', 'diamond_plus']
 */
export function rankTiersForPoints(averagePoints: number): string[] {
  const tiers = ['all'];
  if (averagePoints >= PLATINUM_POINTS) tiers.push('platinum_plus');
  if (averagePoints >= DIAMOND_POINTS)  tiers.push('diamond_plus');
  if (averagePoints >= MASTER_POINTS)   tiers.push('master_plus');
  return tiers;
}

/** 参加者のポイント（名簿にいない人は null）の平均を出す。null は Gold 相当として数える */
export function averageMatchPoints(points: Array<number | null>): number {
  if (points.length === 0) return UNKNOWN_PLAYER_POINTS;
  const sum = points.reduce<number>((acc, p) => acc + (p ?? UNKNOWN_PLAYER_POINTS), 0);
  return sum / points.length;
}

/**
 * 環境変数 TARGET_TIERS（カンマ区切り）から、試合を集める対象のランクを読む
 * 未指定・空なら4ランクすべて。不正な値はエラーにする
 * 例: "PLATINUM" → ['PLATINUM'] / "platinum, diamond" → ['PLATINUM', 'DIAMOND']
 */
export function parseTargetTiers(value: string | undefined): CollectTier[] {
  const items = (value ?? '')
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => t !== '');

  if (items.length === 0) return [...COLLECT_TIERS];

  const invalid = items.filter(t => !(COLLECT_TIERS as readonly string[]).includes(t));
  if (invalid.length > 0) {
    throw new Error(`TARGET_TIERS に不正な値があります（${invalid.join(', ')}）。指定できるのは ${COLLECT_TIERS.join(', ')} です`);
  }
  // 指定順に関係なく、低い順にそろえて重複を除く
  return COLLECT_TIERS.filter(t => items.includes(t));
}

/**
 * 次に試合を取りに行くランクを選ぶ（集めた試合数が最も少ないランクを優先し、数をそろえる）
 * 作業が残っていないランクは選ばない。どのランクにも作業がなければ null
 */
export function pickNextTier(
  targets: readonly CollectTier[],
  collected: Record<CollectTier, number>,
  hasWork: (tier: CollectTier) => boolean
): CollectTier | null {
  let best: CollectTier | null = null;
  for (const tier of targets) {
    if (!hasWork(tier)) continue;
    if (best === null || collected[tier] < collected[best]) best = tier;
  }
  return best;
}
