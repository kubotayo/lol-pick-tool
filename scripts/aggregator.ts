import { normalizePosition, normalizeItemIds } from './utils';
import type { MatchDto, AggregationKey, AggregationValue } from './types';

// 集計結果を保持するマップの型
export type AggregationMap = Map<string, AggregationValue>;

// AggregationKey をマップのキー文字列に変換する
function makeKey(k: AggregationKey): string {
  const base = `${k.championId}|${k.lane}|${k.patch}|${k.region}|${k.rankTier}`;
  if (k.enemyChampionId !== undefined) return `${base}|enemy:${k.enemyChampionId}`;
  if (k.itemIds !== undefined)         return `${base}|items:${k.itemIds}`;
  return base;
}

function increment(map: AggregationMap, key: string, win: boolean): void {
  const current = map.get(key) ?? { gamesPlayed: 0, wins: 0 };
  map.set(key, {
    gamesPlayed: current.gamesPlayed + 1,
    wins:        current.wins + (win ? 1 : 0),
  });
}

export interface AggregationResult {
  championStats:  AggregationMap;
  counterStats:   AggregationMap;
  itemBuildStats: AggregationMap;
}

export function createAggregationResult(): AggregationResult {
  return {
    championStats:  new Map(),
    counterStats:   new Map(),
    itemBuildStats: new Map(),
  };
}

/**
 * 1試合のデータをメモリ上の集計マップに加算する
 * 生データはDBに保存しない設計のため、この関数で全集計を完結させる
 */
export function aggregateMatch(
  match: MatchDto,
  targetPatch: string,
  region: string,
  rankTier: string,
  result: AggregationResult
): void {
  const patch = match.info.gameVersion.split('.').slice(0, 2).join('.');

  // 対象パッチ以外の試合はスキップ（パッチをまたいだデータ混在を防ぐ）
  if (patch !== targetPatch) return;

  const participants = match.info.participants;

  for (const p of participants) {
    const lane = normalizePosition(p.teamPosition);
    if (!lane) continue; // レーン未割り当て（カスタムゲーム等）はスキップ

    const base: Omit<AggregationKey, 'enemyChampionId' | 'itemIds'> = {
      championId: p.championId,
      lane,
      patch,
      region,
      rankTier,
    };

    // champion_stats: チャンピオンの先出し勝率
    increment(
      result.championStats,
      makeKey(base),
      p.win
    );

    // counter_stats: 同レーンの相手チャンピオンとの対戦勝率
    const enemy = participants.find(
      e => e.teamPosition === p.teamPosition && e.teamId !== p.teamId
    );
    if (enemy) {
      increment(
        result.counterStats,
        makeKey({ ...base, enemyChampionId: enemy.championId }),
        p.win
      );
    }

    // item_build_stats: アイテムビルド別勝率
    // item6はトリンケットのため除外（item0〜item5のみ集計）
    const itemIds = normalizeItemIds([p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]);
    if (itemIds) {
      increment(
        result.itemBuildStats,
        makeKey({ ...base, itemIds }),
        p.win
      );
    }
  }
}

// AggregationMap から win_rate を計算してオブジェクト配列に変換する
export function toRows(
  map: AggregationMap,
  minGames = 1
): Array<{ key: string; gamesPlayed: number; wins: number; winRate: number }> {
  return Array.from(map.entries())
    .filter(([, v]) => v.gamesPlayed >= minGames)
    .map(([key, v]) => ({
      key,
      gamesPlayed: v.gamesPlayed,
      wins:        v.wins,
      winRate:     v.wins / v.gamesPlayed,
    }));
}
