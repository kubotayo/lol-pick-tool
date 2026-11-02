import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// テスト用リクエストを生成するヘルパー
// URLを組み立てる処理を共通化し、各テストの可読性を上げるため
// patch は必須のため既定で付ける。外したいときは patch: undefined を渡す
function makeRequest(params: Record<string, string | undefined>): NextRequest {
  const url = new URL('http://localhost/api/champions');
  Object.entries({ patch: '14.21', ...params }).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, v);
  });
  return new NextRequest(url.toString());
}

describe('GET /api/champions', () => {
  describe('正常系', () => {
    it('有効なlaneを指定した場合、200とチャンピオン配列を返す', async () => {
      // Arrange
      const req = makeRequest({ lane: 'MID' });

      // Act
      const res = await GET(req);
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });

    it('全パラメーターを指定した場合、200を返す', async () => {
      const req = makeRequest({
        lane:      'TOP',
        region:    'KR',
        tier:      'diamond_plus',
        limit:     '10',
        min_games: '50',
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('regionを省略した場合、デフォルト(JP)で200を返す', async () => {
      const req = makeRequest({ lane: 'BOT' });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('limitが100を超える場合、100件に切り捨てる', async () => {
      const req = makeRequest({ lane: 'MID', limit: '999' });
      const res = await GET(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.length).toBeLessThanOrEqual(100);
    });
  });

  describe('異常系：laneバリデーション', () => {
    it('laneが未指定の場合、400を返す', async () => {
      // Arrange
      const req = makeRequest({});

      // Act
      const res = await GET(req);
      const body = await res.json();

      // Assert
      expect(res.status).toBe(400);
      expect(body).toHaveProperty('error');
    });

    it('laneに許可リスト外の値を指定した場合、400を返す', async () => {
      const req = makeRequest({ lane: 'INVALID' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('laneに小文字を指定した場合、400を返す', async () => {
      const req = makeRequest({ lane: 'mid' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('異常系：regionバリデーション', () => {
    it('regionに許可リスト外の値を指定した場合、400を返す', async () => {
      const req = makeRequest({ lane: 'MID', region: 'INVALID' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('異常系：tierバリデーション', () => {
    it('tierに許可リスト外の値を指定した場合、400を返す', async () => {
      const req = makeRequest({ lane: 'MID', tier: 'challenger' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });
});

describe('GET /api/champions（patch・数値パラメーター・キャッシュ）', () => {
  it('patch が未指定の場合、400 を返す', async () => {
    const res = await GET(makeRequest({ lane: 'MID', patch: undefined }));
    expect(res.status).toBe(400);
  });

  it('patch の形式が不正な場合、400 を返す', async () => {
    const res = await GET(makeRequest({ lane: 'MID', patch: '14.21.1' }));
    expect(res.status).toBe(400);
  });

  it.each(['abc', '0', '-1', '1.5'])('limit=%s の場合、400 を返す', async (limit) => {
    const res = await GET(makeRequest({ lane: 'MID', limit }));
    expect(res.status).toBe(400);
  });

  it.each(['abc', '-1'])('min_games=%s の場合、400 を返す', async (minGames) => {
    const res = await GET(makeRequest({ lane: 'MID', min_games: minGames }));
    expect(res.status).toBe(400);
  });

  it('min_games=0 は許可する', async () => {
    const res = await GET(makeRequest({ lane: 'MID', min_games: '0' }));
    expect(res.status).toBe(200);
  });

  it('成功時は CDN に1時間キャッシュするヘッダーを付ける', async () => {
    const res = await GET(makeRequest({ lane: 'MID' }));
    expect(res.headers.get('Cache-Control')).toBe('s-maxage=3600, stale-while-revalidate=86400');
  });

  it('エラー時はキャッシュしない', async () => {
    const res = await GET(makeRequest({ lane: 'INVALID' }));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
