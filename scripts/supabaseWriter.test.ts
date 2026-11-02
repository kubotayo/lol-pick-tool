import { describe, it, expect, vi } from 'vitest';

// supabase クライアントは環境変数がないと初期化時にエラーになるため、モックに置き換える
vi.mock('./supabase', () => ({ supabase: {} }));

import { buildChampionRows, buildCounterRows, buildItemRows } from './supabaseWriter';
import { createAggregationResult, aggregateMatch } from './aggregator';
import type { MatchDto } from './types';

// 2人だけの最小構成の試合（MID 同士の対面）
function makeMatch(gameVersion = '16.21.829.8620'): MatchDto {
  const base = { item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 3340 };
  return {
    info: {
      gameVersion,
      participants: [
        { ...base, puuid: 'a', championId: 1,  teamPosition: 'MIDDLE', teamId: 100, win: true,  item0: 3031, item1: 3153 },
        { ...base, puuid: 'b', championId: 99, teamPosition: 'MIDDLE', teamId: 200, win: false },
      ],
    },
  } as unknown as MatchDto;
}

describe('build*Rows', () => {
  const agg = createAggregationResult();
  aggregateMatch(makeMatch(), '16.21', 'JP', ['all'], agg);
  aggregateMatch(makeMatch(), '16.21', 'JP', ['all'], agg);

  it('champion_stats の行にキーと集計値を展開する', () => {
    expect(buildChampionRows(agg.championStats)).toEqual(expect.arrayContaining([
      { champion_id: 1,  lane: 'MID', rank_tier: 'all', games_played: 2, wins: 2 },
      { champion_id: 99, lane: 'MID', rank_tier: 'all', games_played: 2, wins: 0 },
    ]));
  });

  it('counter_stats の行に相手チャンピオンIDを展開する', () => {
    expect(buildCounterRows(agg.counterStats)).toEqual(expect.arrayContaining([
      { champion_id: 1, enemy_champion_id: 99, lane: 'MID', rank_tier: 'all', games_played: 2, wins: 2 },
    ]));
  });

  it('item_build_stats の行にアイテムIDを展開する（空スロットのみの人は含まない）', () => {
    expect(buildItemRows(agg.itemBuildStats)).toEqual([
      { champion_id: 1, lane: 'MID', item_ids: '3031,3153', rank_tier: 'all', games_played: 2, wins: 2 },
    ]);
  });
});

describe('aggregateMatch（複数のランク帯への加算）', () => {
  it('指定したランク帯それぞれに同じ試合を1回ずつ加算する', () => {
    const agg = createAggregationResult();
    aggregateMatch(makeMatch(), '16.21', 'JP', ['all', 'platinum_plus', 'diamond_plus'], agg);

    const rows = buildChampionRows(agg.championStats).filter(r => r.champion_id === 1);
    expect(rows.map(r => r.rank_tier).sort()).toEqual(['all', 'diamond_plus', 'platinum_plus']);
    expect(rows.every(r => r.games_played === 1 && r.wins === 1)).toBe(true);
    expect(buildCounterRows(agg.counterStats)).toHaveLength(6); // 2人 × 3ランク帯
    expect(buildItemRows(agg.itemBuildStats)).toHaveLength(3);  // アイテムがある1人 × 3ランク帯
  });

  it('対象パッチ以外の試合は加算しない', () => {
    const agg = createAggregationResult();
    aggregateMatch(makeMatch('16.20.1.1'), '16.21', 'JP', ['all'], agg);
    expect(agg.championStats.size).toBe(0);
  });
});
