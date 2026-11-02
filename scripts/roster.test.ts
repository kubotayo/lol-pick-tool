import { describe, it, expect, vi } from 'vitest';
import { buildRoster, groupRosterByTier } from './roster';
import type { RiotClient } from './riotClient';

// 偽の Riot API: 各段階は1ページ目だけにプレイヤーがいて、2ページ目は空
function makeClient(options: { failPages?: number } = {}) {
  let failures = options.failPages ?? 0;
  return {
    getApexLeague: vi.fn(async (_queue: string, tier: string) => ({
      tier: tier.toUpperCase(),
      entries: tier === 'challenger' ? [{ puuid: 'chal', rank: 'I', leaguePoints: 1500 }] : [],
    })),
    getLeagueEntries: vi.fn(async (_queue: string, tier: string, division: string, page: number) => {
      if (failures > 0) { failures--; throw new Error('500'); }
      if (page > 1) return [];
      return [{ puuid: `${tier}-${division}`, tier, rank: division, leaguePoints: 10 }];
    }),
  } as unknown as RiotClient;
}

describe('buildRoster', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('Master 以上と Platinum〜Diamond の全段階を名簿に入れる', async () => {
    const roster = await buildRoster(makeClient());
    expect(roster.size).toBe(1 + 3 * 4);
    expect(roster.get('chal')).toEqual({ tier: 'MASTER', points: 3200 });
    expect(roster.get('PLATINUM-IV')).toEqual({ tier: 'PLATINUM', points: 1610 });
    expect(roster.get('EMERALD-I')?.tier).toBe('EMERALD');
  });

  it('1ページの取得に失敗しても、次のページから続ける', async () => {
    const roster = await buildRoster(makeClient({ failPages: 1 }));
    // DIAMOND I の1ページ目だけが抜ける
    expect(roster.has('DIAMOND-I')).toBe(false);
    expect(roster.has('DIAMOND-II')).toBe(true);
  });

  it('取得の失敗が20回を超えたら中止する', async () => {
    await expect(buildRoster(makeClient({ failPages: 21 }))).rejects.toThrow('20回');
  });

  it('puuid がないプレイヤーは名簿に入れない', async () => {
    const client = makeClient();
    vi.mocked(client.getApexLeague).mockResolvedValueOnce({ tier: 'CHALLENGER', entries: [{ puuid: '', rank: 'I', leaguePoints: 0 }] });
    const roster = await buildRoster(client);
    expect(roster.has('')).toBe(false);
  });
});

describe('groupRosterByTier', () => {
  it('ランクごとに分ける', async () => {
    const groups = groupRosterByTier(await buildRoster(makeClient()));
    expect(groups.MASTER).toEqual(['chal']);
    expect(groups.PLATINUM.sort()).toEqual(['PLATINUM-I', 'PLATINUM-II', 'PLATINUM-III', 'PLATINUM-IV']);
  });
});
