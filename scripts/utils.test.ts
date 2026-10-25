import { describe, it, expect } from 'vitest';
import {
  normalizePosition,
  normalizePatch,
  normalizeItemIds,
  is429Error,
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
  it('エラーメッセージに429が含まれる場合はtrueを返す', () => {
    expect(is429Error(new Error('Request failed with status 429'))).toBe(true);
  });

  it('エラーメッセージにRate limitが含まれる場合はtrueを返す', () => {
    expect(is429Error(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('429以外のエラーはfalseを返す', () => {
    expect(is429Error(new Error('Request failed with status 500'))).toBe(false);
  });

  it('Errorインスタンス以外はfalseを返す', () => {
    expect(is429Error('error string')).toBe(false);
    expect(is429Error(null)).toBe(false);
    expect(is429Error(429)).toBe(false);
  });
});
