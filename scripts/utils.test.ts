import { describe, it, expect } from 'vitest';
import {
  normalizePosition,
  normalizePatch,
  normalizeItemIds,
  is429Error,
  parseTargetRegion,
  parsePositiveInt,
  getStopReason,
  HttpError,
} from './utils';

// -------------------------------------------------------
// normalizePosition
// Riot API の teamPosition → DB 保存用レーン略称
// -------------------------------------------------------
describe('normalizePosition', () => {
  it('TOPはTOPを返す', () => {
    expect(normalizePosition('TOP')).toBe('TOP');
  });

  it('JUNGLEはJGを返す', () => {
    expect(normalizePosition('JUNGLE')).toBe('JG');
  });

  it('MIDDLEはMIDを返す', () => {
    expect(normalizePosition('MIDDLE')).toBe('MID');
  });

  it('BOTTOMはBOTを返す', () => {
    expect(normalizePosition('BOTTOM')).toBe('BOT');
  });

  it('UTILITYはSUPを返す', () => {
    expect(normalizePosition('UTILITY')).toBe('SUP');
  });

  it('空文字はnullを返す（レーン未割り当ての試合で発生する）', () => {
    expect(normalizePosition('')).toBeNull();
  });

  it('未知のポジションはnullを返す', () => {
    expect(normalizePosition('UNKNOWN')).toBeNull();
  });
});

// -------------------------------------------------------
// normalizePatch
// Riot API の gameVersion → パッチ番号（先頭2セグメント）
// -------------------------------------------------------
describe('normalizePatch', () => {
  it('4セグメントのgameVersionを2セグメントに正規化する', () => {
    // Arrange
    const gameVersion = '14.21.619.9898';

    // Act
    const result = normalizePatch(gameVersion);

    // Assert
    expect(result).toBe('14.21');
  });

  it('Data Dragonのバージョン形式（3セグメント）も正規化できる', () => {
    expect(normalizePatch('14.21.1')).toBe('14.21');
  });

  it('2セグメントのバージョンはそのまま返す', () => {
    expect(normalizePatch('14.21')).toBe('14.21');
  });

  it('メジャーバージョンが1桁でも正しく処理する', () => {
    expect(normalizePatch('9.10.301.5678')).toBe('9.10');
  });
});

// -------------------------------------------------------
// normalizeItemIds
// アイテム配列 → ソート済みカンマ区切り文字列
// -------------------------------------------------------
describe('normalizeItemIds', () => {
  it('0を除外してソート済みカンマ区切り文字列を返す', () => {
    // Arrange
    const items = [3153, 0, 3031, 6675, 0, 0];

    // Act
    const result = normalizeItemIds(items);

    // Assert
    expect(result).toBe('3031,3153,6675');
  });

  it('購入順が異なっても同じ結果を返す（集計の一貫性のため）', () => {
    const order1 = normalizeItemIds([6675, 3031, 3153, 0, 0, 0]);
    const order2 = normalizeItemIds([3031, 6675, 3153, 0, 0, 0]);
    expect(order1).toBe(order2);
  });

  it('全スロットが0の場合は空文字を返す', () => {
    expect(normalizeItemIds([0, 0, 0, 0, 0, 0])).toBe('');
  });

  it('1アイテムのみの場合も正しく処理する', () => {
    expect(normalizeItemIds([3153, 0, 0, 0, 0, 0])).toBe('3153');
  });
});

// -------------------------------------------------------
// is429Error
// Riot API のレート制限エラー判定
// -------------------------------------------------------
describe('is429Error', () => {
  it('ステータスコードが429ならtrueを返す', () => {
    expect(is429Error(new HttpError('Too Many Requests', 429))).toBe(true);
  });

  it('429以外のステータスコードはfalseを返す', () => {
    expect(is429Error(new HttpError('Internal Server Error', 500))).toBe(false);
  });

  it('メッセージ（URL）に429が含まれていても、ステータスコードが429でなければfalseを返す', () => {
    expect(is429Error(new HttpError('404 Not Found [https://asia.api.riotgames.com/lol/match/v5/matches/JP1_4290000]', 404))).toBe(false);
    expect(is429Error(new Error('Request failed with status 429'))).toBe(false);
  });

  it('Errorインスタンス以外はfalseを返す', () => {
    expect(is429Error('error string')).toBe(false);
    expect(is429Error(null)).toBe(false);
    expect(is429Error(429)).toBe(false);
  });
});

// -------------------------------------------------------
// parseTargetRegion
// TARGET_REGIONS → 収集対象プラットフォーム（現状は1つのみ）
// -------------------------------------------------------
describe('parseTargetRegion', () => {
  it('jp1はjp1を返す', () => {
    expect(parseTargetRegion('jp1')).toBe('jp1');
  });

  it('未指定ならjp1を返す', () => {
    expect(parseTargetRegion(undefined)).toBe('jp1');
    expect(parseTargetRegion('')).toBe('jp1');
  });

  it('前後の空白・大文字を正規化する', () => {
    expect(parseTargetRegion(' JP1 ')).toBe('jp1');
  });

  it('複数指定はエラーにする', () => {
    expect(() => parseTargetRegion('jp1,kr')).toThrow('複数のリージョン');
  });
});

// -------------------------------------------------------
// parsePositiveInt
// 上限値の環境変数（MAX_DURATION_MINUTES / MAX_MATCHES）
// -------------------------------------------------------
describe('parsePositiveInt', () => {
  it('数値文字列を数値にする', () => {
    expect(parsePositiveInt('MAX_MATCHES', '50', null)).toBe(50);
  });

  // ENV-09
  it('最小の正の整数 1 は受け付ける', () => {
    expect(parsePositiveInt('MAX_DURATION_MINUTES', '1', 330)).toBe(1);
  });

  it('未指定・空文字ならデフォルト値を返す', () => {
    expect(parsePositiveInt('MAX_DURATION_MINUTES', undefined, 330)).toBe(330);
    expect(parsePositiveInt('MAX_MATCHES', '', null)).toBeNull();
  });

  it('0・負数・小数・数値以外はエラーにする', () => {
    for (const v of ['0', '-5', '1.5', 'abc']) {
      expect(() => parsePositiveInt('MAX_MATCHES', v, null)).toThrow('MAX_MATCHES');
    }
  });
});

// -------------------------------------------------------
// getStopReason
// 時間上限・試合数上限のうち先に達した方で止める
// -------------------------------------------------------
describe('getStopReason', () => {
  const base = { elapsedMs: 0, maxDurationMs: 1000, totalMatches: 0, maxMatches: 50 };

  it('どちらにも達していなければnull', () => {
    expect(getStopReason({ ...base, elapsedMs: 999, totalMatches: 49 })).toBeNull();
  });

  it('時間上限に達したらtime_limit', () => {
    expect(getStopReason({ ...base, elapsedMs: 1000 })).toBe('time_limit');
  });

  it('試合数上限に達したらmatch_limit', () => {
    expect(getStopReason({ ...base, totalMatches: 50 })).toBe('match_limit');
  });

  it('試合数上限がnullなら試合数では止めない', () => {
    expect(getStopReason({ ...base, totalMatches: 100000, maxMatches: null })).toBeNull();
  });
});
