import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiotClient } from './riotClient';

// fetch を偽物に差し替え、呼ばれた時刻（偽のタイマーの時刻）と URL を記録する
// statuses の順に応答し、使い切ったら 200 を返す
function stubFetch(statuses: number[] = []) {
  const queue = [...statuses];
  const calls: Array<{ url: string; at: number }> = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push({ url, at: Date.now() });
    const status = queue.shift() ?? 200;
    return {
      ok:         status >= 200 && status < 300,
      status,
      statusText: status === 429 ? 'Too Many Requests' : String(status),
      json:       async () => ({}),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

// 呼び出しの間隔（ミリ秒）
const gaps = (calls: Array<{ at: number }>) => calls.slice(1).map((c, i) => c.at - calls[i].at);

describe('RiotClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('RIOT_API_KEY', 'test-key');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ENV-04
  it('存在しないプラットフォームはエラーにする', () => {
    expect(() => new RiotClient('xx1')).toThrow('不明なプラットフォーム');
  });

  it('APIキーの確認で 403 が返ったら、キーの失効を示すエラーにする', async () => {
    stubFetch([403]);
    const client = new RiotClient('jp1');

    const done = client.validateApiKey();
    const assertion = expect(done).rejects.toThrow('Riot APIキーが無効または失効しています');
    await vi.runAllTimersAsync();
    await assertion;
  });

  // ENV-13
  it('RIOT_API_KEY が未設定ならエラーにし、Riot API を呼ばない', () => {
    const { fetchMock } = stubFetch();
    vi.stubEnv('RIOT_API_KEY', '');
    expect(() => new RiotClient('jp1')).toThrow('RIOT_API_KEY が設定されていません');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // API-01
  it('リクエストの前に 1.2秒待ち、続けて呼んでも間隔が 1.2秒以上あく', async () => {
    const { calls } = stubFetch();
    const client = new RiotClient('jp1');
    const startedAt = Date.now();

    // バッチと同じく、前の応答を待ってから次を呼ぶ
    const done = (async () => {
      await client.getMatch('JP1_1');
      await client.getMatch('JP1_2');
    })();
    await vi.advanceTimersByTimeAsync(1199);
    expect(calls).toHaveLength(0);
    await vi.runAllTimersAsync();
    await done;

    expect(calls).toHaveLength(2);
    expect(calls[0].at - startedAt).toBe(1200);
    expect(gaps(calls).every(g => g >= 1200)).toBe(true);
  });

  // API-02
  it('429 が1回なら、1秒待って再試行し、成功する', async () => {
    const { calls } = stubFetch([429]);
    const client = new RiotClient('jp1');

    const done = client.getMatch('JP1_1');
    await vi.runAllTimersAsync();

    await expect(done).resolves.toEqual({});
    expect(calls).toHaveLength(2);
    expect(gaps(calls)).toEqual([1000 + 1200]); // 再試行の待ち 1秒 + リクエスト間隔 1.2秒
  });

  // API-03
  it('429 が4回なら、1・2・4・8秒待って再試行し、成功する', async () => {
    const { calls } = stubFetch([429, 429, 429, 429]);
    const client = new RiotClient('jp1');

    const done = client.getMatch('JP1_1');
    await vi.runAllTimersAsync();

    await expect(done).resolves.toEqual({});
    expect(calls).toHaveLength(5);
    expect(gaps(calls)).toEqual([1000, 2000, 4000, 8000].map(ms => ms + 1200));
  });

  // API-04
  it('429 が5回続いたら、再試行をやめてエラーにする', async () => {
    const { calls } = stubFetch([429, 429, 429, 429, 429, 200]);
    const client = new RiotClient('jp1');

    const done = client.getMatch('JP1_1');
    const assertion = expect(done).rejects.toMatchObject({ status: 429 });
    await vi.runAllTimersAsync();
    await assertion;

    expect(calls).toHaveLength(5);
  });

  // API-05
  it.each([404, 500])('%i など 429 以外のエラーは再試行しない', async status => {
    const { calls } = stubFetch([status]);
    const client = new RiotClient('jp1');

    const done = client.getMatch('JP1_1');
    const assertion = expect(done).rejects.toMatchObject({ status });
    await vi.runAllTimersAsync();
    await assertion;

    expect(calls).toHaveLength(1);
  });

  // API-05（URL に "429" を含む場合。以前はメッセージの文字列で判定していたため再試行していた）
  it('試合IDに "429" を含む試合の 404 も再試行しない', async () => {
    const { calls } = stubFetch([404]);
    const client = new RiotClient('jp1');

    const done = client.getMatch('JP1_4290000');
    const assertion = expect(done).rejects.toMatchObject({ status: 404 });
    await vi.runAllTimersAsync();
    await assertion;

    expect(calls).toHaveLength(1);
  });

  // API-06
  it('jp1 では LEAGUE-V4 を jp1、MATCH-V5 を asia のホストに送る', async () => {
    const { calls } = stubFetch();
    const client = new RiotClient('jp1');

    const done = Promise.all([
      client.getLeagueEntries('RANKED_SOLO_5x5', 'PLATINUM', 'IV'),
      client.getApexLeague('RANKED_SOLO_5x5', 'master'),
      client.getMatchIds('puuid-1'),
      client.getMatch('JP1_1'),
    ]);
    await vi.runAllTimersAsync();
    await done;

    const hosts = calls.map(c => new URL(c.url).host);
    expect(hosts).toEqual([
      'jp1.api.riotgames.com', 'jp1.api.riotgames.com',
      'asia.api.riotgames.com', 'asia.api.riotgames.com',
    ]);
    expect(new URL(calls[0].url).pathname).toMatch(/^\/lol\/league\/v4\//);
    expect(new URL(calls[3].url).pathname).toMatch(/^\/lol\/match\/v5\//);
  });

  // API-07
  it('試合ID一覧はソロランク（queue=420）を指定し、渡した件数を count に入れる', async () => {
    const { calls } = stubFetch();
    const client = new RiotClient('jp1');

    const done = client.getMatchIds('puuid-1', 7);
    await vi.runAllTimersAsync();
    await done;

    const params = new URL(calls[0].url).searchParams;
    expect(params.get('queue')).toBe('420');
    expect(params.get('count')).toBe('7');
  });
});
