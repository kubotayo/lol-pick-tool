import { describe, it, expect } from 'vitest';
import { parseIntParam, isValidPatch, sortPatchesDesc } from './api';
import { DEFAULT_MIN_GAMES } from './constants';

describe('parseIntParam', () => {
  it('未指定・空なら既定値', () => {
    expect(parseIntParam(null, 20, 1)).toBe(20);
    expect(parseIntParam('', 20, 1)).toBe(20);
  });

  it('整数でない・下限未満なら null', () => {
    expect(parseIntParam('abc', 20, 1)).toBeNull();
    expect(parseIntParam('1.5', 20, 1)).toBeNull();
    expect(parseIntParam('0', 20, 1)).toBeNull();
  });

  it('下限以上の整数ならその値', () => {
    expect(parseIntParam('0', 100, 0)).toBe(0);
    expect(parseIntParam('15', 20, 1)).toBe(15);
  });
});

describe('isValidPatch', () => {
  it('数字.数字 の形だけ許可する', () => {
    expect(isValidPatch('14.21')).toBe(true);
    expect(isValidPatch('14.21.1')).toBe(false);
    expect(isValidPatch('latest')).toBe(false);
    expect(isValidPatch(null)).toBe(false);
  });
});

describe('sortPatchesDesc', () => {
  it('数値として新しい順に並べる（14.10 は 14.9 より新しい）', () => {
    expect(sortPatchesDesc(['14.9', '14.10', '15.1', '14.2'])).toEqual(['15.1', '14.10', '14.9', '14.2']);
  });
});

describe('DEFAULT_MIN_GAMES', () => {
  it('上のランク帯ほど最低試合数が低い', () => {
    expect(DEFAULT_MIN_GAMES.champions).toEqual({ all: 100, platinum_plus: 100, diamond_plus: 50, master_plus: 30 });
    expect(DEFAULT_MIN_GAMES.counter).toEqual({ all: 200, platinum_plus: 200, diamond_plus: 100, master_plus: 50 });
  });
});
