import { describe, it, expect, vi } from 'vitest';
import { collectMatches, type MatchSource, type CollectOptions } from './collector';
import { buildChampionRows } from './supabaseWriter';
import type { Roster } from './roster';
import type { CollectTier } from './rank';
import type { MatchDto } from './types';

// supabaseWriter が読み込む supabase クライアントは環境変数がないと初期化時にエラーになるため、モックに置き換える
vi.mock('./supabase', () => ({ supabase: {} }));

const PATCH = '16.21';
const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

// 10人の試合を作る（先頭5人が勝ちチーム）。championId は人ごとに変える
function makeMatch(puuids: string[], gameVersion = '16.21.1.1'): MatchDto {
  return {
    info: {
      gameVersion,
      participants: puuids.map((puuid, i) => ({
        puuid,
        championId:   i + 1,
        championName: `C${i + 1}`,
        teamPosition: POSITIONS[i % 5],
        teamId:       i < 5 ? 100 : 200,
        win:          i < 5,
        item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
      })),
    },
  } as unknown as MatchDto;
}

// プレイヤーごとの試合ID一覧と、試合IDごとの試合を持つ偽の Riot API
function makeSource(matchIdsByPlayer: Record<string, string[]>, matches: Record<string, MatchDto>) {
  const source = {
    getMatchIds: vi.fn(async (puuid: string) => matchIdsByPlayer[puuid] ?? []),
    getMatch:    vi.fn(async (id: string) => {
      const m = matches[id];
      if (!m) throw new Error(`404 ${id}`);
      return m;
    }),
  } satisfies MatchSource;
  return source;
}

// 名簿: 指定した人をそのランク・ポイントで登録する
function makeRoster(entries: Array<[string, CollectTier, number]>): Roster {
  return new Map(entries.map(([puuid, tier, points]) => [puuid, { tier, points }]));
}

function options(overrides: Partial<CollectOptions>): CollectOptions {
  return {
    patch:            PATCH,
    region:           'JP',
    targetTiers:      ['PLATINUM'],
    roster:           new Map(),
    seedPools:        { PLATINUM: [], EMERALD: [], DIAMOND: [], MASTER: [] },
    processedIds:     new Set(),
    seedsPerTier:     5,
    matchesPerPlayer: 20,
    shouldStop:       () => null,
    ...overrides,
  };
}

// 名簿にいない9人（Gold 相当）で埋めた10人
const others = (prefix: string) => Array.from({ length: 9 }, (_, i) => `${prefix}-x${i}`);

describe('collectMatches', () => {
  it('複数のプレイヤーから同じ試合IDが返っても1回だけ集計する', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700], ['p2', 'PLATINUM', 1700]]);
    const source = makeSource(
      { p1: ['m1'], p2: ['m1'] },
      { m1: makeMatch(['p1', 'p2', ...others('m1').slice(0, 8)]) },
    );

    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p2', 'p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(result.matchIds).toEqual(['m1']);
    expect(source.getMatch).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe('queue_empty');
  });

  it('前回までに処理済みの試合は取りに行かない', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700]]);
    const source = makeSource({ p1: ['done', 'm2'] }, { m2: makeMatch(['p1', ...others('m2')]) });

    const result = await collectMatches(source, options({
      roster, processedIds: new Set(['done']),
      seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: [], MASTER: [] },
    }));

    expect(result.matchIds).toEqual(['m2']);
    expect(source.getMatch).not.toHaveBeenCalledWith('done');
  });

  it('古いパッチの試合が出たら、そのプレイヤーの残りの試合は取りに行かない', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700]]);
    const source = makeSource(
      { p1: ['new1', 'old1', 'old2', 'old3'] },
      {
        new1: makeMatch(['p1', ...others('n1')]),
        old1: makeMatch(['p1', ...others('o1')], '16.20.1.1'),
        old2: makeMatch(['p1', ...others('o2')], '16.20.1.1'),
        old3: makeMatch(['p1', ...others('o3')], '16.20.1.1'),
      },
    );

    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(result.matchIds).toEqual(['new1']);
    expect(source.getMatch.mock.calls.map(c => c[0])).toEqual(['new1', 'old1']);
  });

  it('リメイクの試合は集計せず、参加者も次のシードにしないが、同じプレイヤーの残りの試合は続ける', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700], ['p2', 'PLATINUM', 1700]]);
    const remake = makeMatch(['p1', 'p2', ...others('r1').slice(0, 8)]);
    remake.info.participants.forEach(p => { p.gameEndedInEarlySurrender = true; });
    const source = makeSource(
      { p1: ['r1', 'm2'] },
      { r1: remake, m2: makeMatch(['p1', ...others('m2')]) },
    );

    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(result.matchIds).toEqual(['m2']);
    expect(result.collected.PLATINUM).toBe(1);
    expect(source.getMatchIds).not.toHaveBeenCalledWith('p2', expect.anything());
  });

  it('複数のランクを対象にしたとき、ランクごとの試合数をそろえる', async () => {
    // 各ランクに十分な数のプレイヤーと試合を用意する
    const roster: Array<[string, CollectTier, number]> = [];
    const idsByPlayer: Record<string, string[]> = {};
    const matches: Record<string, MatchDto> = {};
    for (const [tier, points] of [['PLATINUM', 1700], ['DIAMOND', 2500]] as const) {
      for (let i = 0; i < 10; i++) {
        const puuid = `${tier}-${i}`;
        roster.push([puuid, tier, points]);
        idsByPlayer[puuid] = [0, 1, 2].map(j => `${puuid}-m${j}`);
        for (const id of idsByPlayer[puuid]) matches[id] = makeMatch([puuid, ...others(id)]);
      }
    }
    const seedPools = {
      PLATINUM: roster.filter(r => r[1] === 'PLATINUM').map(r => r[0]),
      EMERALD: [], MASTER: [],
      DIAMOND: roster.filter(r => r[1] === 'DIAMOND').map(r => r[0]),
    };

    const result = await collectMatches(makeSource(idsByPlayer, matches), options({
      roster: makeRoster(roster), seedPools, targetTiers: ['PLATINUM', 'DIAMOND'],
      shouldStop: total => (total >= 20 ? 'match_limit' : null),
    }));

    expect(result.stopReason).toBe('match_limit');
    expect(result.matchIds).toHaveLength(20);
    expect(Math.abs(result.collected.PLATINUM - result.collected.DIAMOND)).toBeLessThanOrEqual(1);
  });

  it('試合の参加者のうち、名簿にいて収集対象ランクの人だけを次のシードにする', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700], ['p2', 'PLATINUM', 1700], ['d1', 'DIAMOND', 2500]]);
    const source = makeSource(
      { p1: ['m1'], p2: ['m2'], d1: ['m3'] },
      {
        m1: makeMatch(['p1', 'p2', 'd1', ...others('m1').slice(0, 7)]),
        m2: makeMatch(['p2', ...others('m2')]),
        m3: makeMatch(['d1', ...others('m3')]),
      },
    );

    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: ['d1'], MASTER: [] } }));

    // p2 はスノーボールで追加される。d1 は DIAMOND が対象外なので追加されない。名簿にいない人も追加されない
    expect(source.getMatchIds.mock.calls.map(c => c[0])).toEqual(['p1', 'p2']);
    expect(result.matchIds).toEqual(['m1', 'm2']);
  });

  it('10人の平均ランクで、加算するランク帯を決める', async () => {
    const masters = Array.from({ length: 10 }, (_, i) => `ms${i}`);
    const roster = makeRoster(masters.map(p => [p, 'MASTER', 2900] as [string, CollectTier, number]));
    const source = makeSource({ ms0: ['m1'] }, { m1: makeMatch(masters) });

    const result = await collectMatches(source, options({
      roster, targetTiers: ['MASTER'],
      seedPools: { PLATINUM: [], EMERALD: [], DIAMOND: [], MASTER: ['ms0'] },
      shouldStop: total => (total >= 1 ? 'match_limit' : null),
    }));

    expect(result.rankTierCounts).toEqual({ all: 1, platinum_plus: 1, diamond_plus: 1, master_plus: 1 });
    const tiers = new Set(buildChampionRows(result.aggregation.championStats).map(r => r.rank_tier));
    expect([...tiers].sort()).toEqual(['all', 'diamond_plus', 'master_plus', 'platinum_plus']);
  });

  it('試合詳細の取得に失敗しても、次の試合に進む', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700]]);
    const source = makeSource({ p1: ['missing', 'm2'] }, { m2: makeMatch(['p1', ...others('m2')]) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(result.matchIds).toEqual(['m2']);
  });

  // LOOP-05
  it('対象パッチより新しいパッチの試合も集計しない', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700]]);
    const source = makeSource({ p1: ['newer'] }, { newer: makeMatch(['p1', ...others('nw')], '16.22.1.1') });

    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(result.matchIds).toEqual([]);
    expect(result.aggregation.championStats.size).toBe(0);
  });

  // LOOP-08
  it('キューが空のランクには名簿から5人ずつ補充し、残りが5人未満なら残り全員を入れる', async () => {
    // シードは末尾から使うので、s7〜s3 の5人が先に入り、s2・s1 は次の補充で入る
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
    const roster = makeRoster([...seeds, 'snow'].map(p => [p, 'PLATINUM', 1700] as [string, CollectTier, number]));
    // s7 の試合に名簿の snow が出ている。snow はスノーボールで、最初の5人の後ろに並ぶ
    const source = makeSource({ s7: ['m1'] }, { m1: makeMatch(['s7', 'snow', ...others('m1').slice(0, 8)]) });

    await collectMatches(source, options({ roster, seedPools: { PLATINUM: seeds, EMERALD: [], DIAMOND: [], MASTER: [] } }));

    // 補充が1人ずつなら snow が s6 より前に、7人まとめてなら s1 より後ろに来る
    expect(source.getMatchIds.mock.calls.map(c => c[0])).toEqual(['s7', 's6', 's5', 's4', 's3', 'snow', 's2', 's1']);
  });

  // LOOP-10
  it('一度キューに入れたプレイヤーが別の試合にも出ていたら、二度目はキューに入れない', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700], ['p2', 'PLATINUM', 1700]]);
    const source = makeSource(
      { p1: ['m1', 'm2'] },
      {
        m1: makeMatch(['p1', 'p2', ...others('m1').slice(0, 8)]),
        m2: makeMatch(['p1', 'p2', ...others('m2').slice(0, 8)]),
      },
    );

    await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(source.getMatchIds.mock.calls.map(c => c[0])).toEqual(['p1', 'p2']);
  });

  // LOOP-11（06 の未決事項 Q-4。今の実装の動きを記録する）
  it('試合ID一覧の取得に失敗したプレイヤーは飛ばして、次のプレイヤーに進む', async () => {
    const roster = makeRoster([['p1', 'PLATINUM', 1700], ['p2', 'PLATINUM', 1700]]);
    const source = makeSource({ p2: ['m2'] }, { m2: makeMatch(['p2', ...others('m2')]) });
    source.getMatchIds.mockRejectedValueOnce(new Error('500'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 末尾から使うので p1 が先
    const result = await collectMatches(source, options({ roster, seedPools: { PLATINUM: ['p2', 'p1'], EMERALD: [], DIAMOND: [], MASTER: [] } }));

    expect(source.getMatchIds.mock.calls.map(c => c[0])).toEqual(['p1', 'p2']);
    expect(result.matchIds).toEqual(['m2']);
  });

  it('名簿のプレイヤーを使い切ったら queue_empty で終わる', async () => {
    const result = await collectMatches(makeSource({}, {}), options({}));
    expect(result.stopReason).toBe('queue_empty');
    expect(result.matchIds).toEqual([]);
  });
});
