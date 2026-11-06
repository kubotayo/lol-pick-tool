import { describe, it, expect, vi } from 'vitest';

// supabaseWriter（行の組み立てに使う）が読み込む supabase クライアントは、環境変数がないと初期化時にエラーになるため、モックに置き換える
vi.mock('./supabase', () => ({ supabase: {} }));

import { createAggregationResult, aggregateMatch } from './aggregator';
import { buildChampionRows, buildCounterRows } from './supabaseWriter';
import type { MatchDto } from './types';

type P = { championId: number; teamPosition: string; teamId: number; win: boolean };

function makeMatch(participants: P[]): MatchDto {
  const items = { item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0 };
  return {
    info: {
      gameVersion: '16.21.1.1',
      participants: participants.map((p, i) => ({ ...items, ...p, puuid: `u${i}` })),
    },
  } as unknown as MatchDto;
}

const blue = (championId: number, teamPosition: string, win: boolean): P => ({ championId, teamPosition, teamId: 100, win });
const red  = (championId: number, teamPosition: string, win: boolean): P => ({ championId, teamPosition, teamId: 200, win });

describe('aggregateMatch', () => {
  // AGG-05
  it('同じレーンの相手がいれば、counter_stats に (自分, 相手) と (相手, 自分) の行が1つずつでき、勝ちはどちらか一方だけ', () => {
    const agg = createAggregationResult();
    aggregateMatch(makeMatch([blue(1, 'MIDDLE', true), red(2, 'MIDDLE', false)]), '16.21', 'JP', ['all'], agg);

    expect(buildCounterRows(agg.counterStats)).toEqual(expect.arrayContaining([
      { champion_id: 1, enemy_champion_id: 2, lane: 'MID', rank_tier: 'all', games_played: 1, wins: 1 },
      { champion_id: 2, enemy_champion_id: 1, lane: 'MID', rank_tier: 'all', games_played: 1, wins: 0 },
    ]));
    expect(agg.counterStats.size).toBe(2);
  });

  // AGG-06
  it('同じレーンに相手がいなければ、counter_stats には加算せず、champion_stats には加算する', () => {
    const agg = createAggregationResult();
    aggregateMatch(makeMatch([blue(1, 'MIDDLE', true), red(2, 'TOP', false)]), '16.21', 'JP', ['all'], agg);

    expect(agg.counterStats.size).toBe(0);
    expect(buildChampionRows(agg.championStats)).toEqual(expect.arrayContaining([
      { champion_id: 1, lane: 'MID', rank_tier: 'all', games_played: 1, wins: 1 },
      { champion_id: 2, lane: 'TOP', rank_tier: 'all', games_played: 1, wins: 0 },
    ]));
  });

  // AGG-10
  it('同じチャンピオン・レーンが複数の試合に出たら、1行にまとめて試合数と勝ち数を足し合わせる', () => {
    const agg = createAggregationResult();
    aggregateMatch(makeMatch([blue(1, 'MIDDLE', true),  red(2, 'MIDDLE', false)]), '16.21', 'JP', ['all'], agg);
    aggregateMatch(makeMatch([blue(1, 'MIDDLE', false), red(3, 'MIDDLE', true)]),  '16.21', 'JP', ['all'], agg);

    const rows = buildChampionRows(agg.championStats).filter(r => r.champion_id === 1);
    expect(rows).toEqual([{ champion_id: 1, lane: 'MID', rank_tier: 'all', games_played: 2, wins: 1 }]);
  });
});
