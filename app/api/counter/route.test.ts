import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// テスト用リクエストを生成するヘルパー
function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/counter');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe('GET /api/counter', () => {
  describe('正常系', () => {
    it('有効なenemy_champion_idとlaneを指定した場合、200を返す', async () => {
      // Arrange
      const req = makeRequest({ enemy_champion_id: '122', lane: 'TOP' });

      // Act
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
    });

    it('モックデータに存在しないchampion_idの場合、200と空配列を返す', async () => {
      const req = makeRequest({ enemy_champion_id: '9999', lane: 'TOP' });
      const res = await GET(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('異常系：enemy_champion_idバリデーション', () => {
    it('enemy_champion_idが未指定の場合、400を返す', async () => {
      // Arrange
      const req = makeRequest({ lane: 'TOP' });

      // Act
      const res = await GET(req);
      const body = await res.json();

      // Assert
      expect(res.status).toBe(400);
      expect(body).toHaveProperty('error');
    });

    it('enemy_champion_idに文字列を指定した場合、400を返す', async () => {
      const req = makeRequest({ enemy_champion_id: 'darius', lane: 'TOP' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('enemy_champion_idに0を指定した場合、400を返す', async () => {
      const req = makeRequest({ enemy_champion_id: '0', lane: 'TOP' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('異常系：laneバリデーション', () => {
    it('laneが未指定の場合、400を返す', async () => {
      const req = makeRequest({ enemy_champion_id: '122' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('laneに許可リスト外の値を指定した場合、400を返す', async () => {
      const req = makeRequest({ enemy_champion_id: '122', lane: 'SUPPORT' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('異常系：regionバリデーション', () => {
    it('regionに許可リスト外の値を指定した場合、400を返す', async () => {
      const req = makeRequest({ enemy_champion_id: '122', lane: 'TOP', region: 'CN' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });
});
