import { supabase } from './supabase';
import type { AggregationMap, AggregationResult } from './aggregator';

// Supabase（PostgREST）は1回の SELECT で最大1000件までしか返さないため、ページ単位で取得する
const SELECT_PAGE_SIZE = 1000;

// 集計マップのキーは "championId|lane|patch|region|rankTier[|enemy:N or |items:...]"（aggregator.ts の makeKey）

/** champion_stats 用の行に変換する */
export function buildChampionRows(map: AggregationMap) {
  return Array.from(map.entries()).map(([key, val]) => {
    const [championId, lane, , , rankTier] = key.split('|');
    return {
      champion_id:  Number(championId),
      lane,
      rank_tier:    rankTier,
      games_played: val.gamesPlayed,
      wins:         val.wins,
    };
  });
}

/** counter_stats 用の行に変換する */
export function buildCounterRows(map: AggregationMap) {
  return Array.from(map.entries()).map(([key, val]) => {
    const [championId, lane, , , rankTier, enemyPart] = key.split('|');
    return {
      champion_id:       Number(championId),
      enemy_champion_id: Number(enemyPart.replace('enemy:', '')),
      lane,
      rank_tier:         rankTier,
      games_played:      val.gamesPlayed,
      wins:              val.wins,
    };
  });
}

/** item_build_stats 用の行に変換する */
export function buildItemRows(map: AggregationMap) {
  return Array.from(map.entries()).map(([key, val]) => {
    const [championId, lane, , , rankTier, itemPart] = key.split('|');
    return {
      champion_id:  Number(championId),
      lane,
      rank_tier:    rankTier,
      item_ids:     itemPart.replace('items:', ''),
      games_played: val.gamesPlayed,
      wins:         val.wins,
    };
  });
}

/**
 * 1回のバッチ実行の結果を DB に書き込む（DB 関数 apply_batch_result、005 マイグレーション）
 * - 各行は自分の rank_tier を持つ（1試合が複数のランク帯に加算されるため）
 * - 集計3テーブルは既存値に加算し、processed_matches に試合IDを記録する
 * - すべて1トランザクション。処理済みの試合が含まれていたらエラーになり、何も書き込まれない
 */
export async function applyBatchResult(
  aggregation: AggregationResult,
  matchIds: string[],
  patch: string,
  region: string
): Promise<{ championRows: number; counterRows: number; itemRows: number }> {
  const championRows = buildChampionRows(aggregation.championStats);
  const counterRows  = buildCounterRows(aggregation.counterStats);
  const itemRows     = buildItemRows(aggregation.itemBuildStats);

  const { error } = await supabase.rpc('apply_batch_result', {
    p_patch:         patch,
    p_region:        region,
    p_champion_rows: championRows,
    p_counter_rows:  counterRows,
    p_item_rows:     itemRows,
    p_match_ids:     matchIds,
  });
  if (error) throw new Error(`[apply_batch_result] 書き込み失敗: ${error.message}`);

  return {
    championRows: championRows.length,
    counterRows:  counterRows.length,
    itemRows:     itemRows.length,
  };
}

/**
 * 試合を少しずつ書き込み、書き込み終えた試合数を数える（02 ステップ6・7）
 * write が失敗したら、その回の試合は数えない（書き込まれていないため）。written() は失敗した後も、それまでの数を返す
 */
export function createChunkWriter(patch: string, region: string) {
  let written = 0;
  return {
    async write(aggregation: AggregationResult, matchIds: string[]) {
      const counts = await applyBatchResult(aggregation, matchIds, patch, region);
      written += matchIds.length;
      return counts;
    },
    written: () => written,
  };
}

// 古いパッチを消すときの1回の上限（DB 関数 archive_old_patches、006 マイグレーション）。API の時間の上限（8秒）に収めるため
const ARCHIVE_ROWS_PER_CALL = 20000;

/**
 * 今のパッチと直前のパッチより古いパッチの item_build_stats と processed_matches を消す（要件 FR-23、02 ステップ2）
 * champion_stats・counter_stats は残す。1回で消すのは最大 ARCHIVE_ROWS_PER_CALL 行で、0 が返るまで繰り返す
 * 戻り値は消した行の合計
 */
export async function archiveOldPatches(currentPatch: string): Promise<number> {
  let total = 0;
  for (;;) {
    const { data, error } = await supabase.rpc('archive_old_patches', {
      p_current_patch: currentPatch,
      p_limit:         ARCHIVE_ROWS_PER_CALL,
    });
    if (error) throw new Error(`[archive_old_patches] 古いパッチの削除に失敗: ${error.message}`);
    const deleted = Number(data ?? 0);
    total += deleted;
    if (deleted === 0) return total;
  }
}

/**
 * processed_matches から処理済み試合IDのセットを取得する
 * BFS キュー追加前の重複チェックに使用する
 */
export async function getProcessedMatchIds(patch: string): Promise<Set<string>> {
  const ids = new Set<string>();

  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('processed_matches')
      .select('match_id')
      .eq('patch', patch)
      .order('match_id')
      .range(from, from + SELECT_PAGE_SIZE - 1);

    if (error) throw new Error(`[processed_matches] 取得失敗: ${error.message}`);
    for (const row of data ?? []) ids.add(row.match_id);
    if (!data || data.length < SELECT_PAGE_SIZE) break;
  }

  return ids;
}
