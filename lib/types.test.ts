import { describe, it, expect } from 'vitest';
import {
  getTierLabel,
  getWinRateColor,
  formatWinRate,
  formatGames,
} from './types';

// -------------------------------------------------------
// getTierLabel
// 設計書(01_requirements.html FR-06)の閾値に準拠:
//   S >= 55% / A 53〜55% / B 51〜53% / C < 51%
// -------------------------------------------------------
describe('getTierLabel', () => {
  describe('Sティア（0.55以上）', () => {
    it('勝率が0.55ちょうどの場合、Sを返す', () => {
      // Arrange
      const winRate = 0.55;
      // Act
      const result = getTierLabel(winRate);
      // Assert
      expect(result).toBe('S');
    });

    it('勝率が0.5501の場合、Sを返す', () => {
      expect(getTierLabel(0.5501)).toBe('S');
    });

    it('勝率が1.0の場合、Sを返す', () => {
      expect(getTierLabel(1.0)).toBe('S');
    });
  });

  describe('Aティア（0.53以上0.55未満）', () => {
    it('勝率が0.53ちょうどの場合、Aを返す', () => {
      expect(getTierLabel(0.53)).toBe('A');
    });

    it('勝率が0.5499の場合（0.55直下）、Aを返す', () => {
      expect(getTierLabel(0.5499)).toBe('A');
    });

    it('勝率が0.5301の場合、Aを返す', () => {
      expect(getTierLabel(0.5301)).toBe('A');
    });
  });

  describe('Bティア（0.51以上0.53未満）', () => {
    it('勝率が0.51ちょうどの場合、Bを返す', () => {
      expect(getTierLabel(0.51)).toBe('B');
    });

    it('勝率が0.5299の場合（0.53直下）、Bを返す', () => {
      expect(getTierLabel(0.5299)).toBe('B');
    });
  });

  describe('Cティア（0.51未満）', () => {
    it('勝率が0.5099の場合（0.51直下）、Cを返す', () => {
      expect(getTierLabel(0.5099)).toBe('C');
    });

    it('勝率が0.5の場合、Cを返す', () => {
      expect(getTierLabel(0.5)).toBe('C');
    });

    it('勝率が0の場合、Cを返す', () => {
      expect(getTierLabel(0)).toBe('C');
    });
  });
});

// -------------------------------------------------------
// getWinRateColor
// 閾値: 0.57以上 → 緑 / 0.53以上 → 黄 / それ以下 → 赤
// -------------------------------------------------------
describe('getWinRateColor', () => {
  describe('緑（0.57以上）', () => {
    it('勝率が0.57ちょうどの場合、text-green-400を返す', () => {
      expect(getWinRateColor(0.57)).toBe('text-green-400');
    });

    it('勝率が0.5701の場合、text-green-400を返す', () => {
      expect(getWinRateColor(0.5701)).toBe('text-green-400');
    });

    it('勝率が1.0の場合、text-green-400を返す', () => {
      expect(getWinRateColor(1.0)).toBe('text-green-400');
    });
  });

  describe('黄（0.53以上0.57未満）', () => {
    it('勝率が0.53ちょうどの場合、text-yellow-400を返す', () => {
      expect(getWinRateColor(0.53)).toBe('text-yellow-400');
    });

    it('勝率が0.5699の場合（0.57直下）、text-yellow-400を返す', () => {
      expect(getWinRateColor(0.5699)).toBe('text-yellow-400');
    });
  });

  describe('赤（0.53未満）', () => {
    it('勝率が0.5299の場合（0.53直下）、text-red-400を返す', () => {
      expect(getWinRateColor(0.5299)).toBe('text-red-400');
    });

    it('勝率が0.5の場合、text-red-400を返す', () => {
      expect(getWinRateColor(0.5)).toBe('text-red-400');
    });

    it('勝率が0の場合、text-red-400を返す', () => {
      expect(getWinRateColor(0)).toBe('text-red-400');
    });
  });
});

// -------------------------------------------------------
// formatWinRate
// 小数（0〜1）を百分率文字列（小数点1桁）に変換する
// -------------------------------------------------------
describe('formatWinRate', () => {
  it('0.5741を"57.4%"に変換する', () => {
    // Arrange
    const winRate = 0.5741;
    // Act
    const result = formatWinRate(winRate);
    // Assert
    expect(result).toBe('57.4%');
  });

  it('0.5を"50.0%"に変換する', () => {
    expect(formatWinRate(0.5)).toBe('50.0%');
  });

  it('0を"0.0%"に変換する', () => {
    expect(formatWinRate(0)).toBe('0.0%');
  });

  it('1を"100.0%"に変換する', () => {
    expect(formatWinRate(1)).toBe('100.0%');
  });

  it('小数点第2位で四捨五入する（0.5745 → "57.5%"）', () => {
    expect(formatWinRate(0.5745)).toBe('57.5%');
  });
});

// -------------------------------------------------------
// formatGames
// 試合数を日本語ロケールのカンマ区切りに変換する
// -------------------------------------------------------
describe('formatGames', () => {
  it('1000未満はカンマなしで返す（999 → "999"）', () => {
    expect(formatGames(999)).toBe('999');
  });

  it('1000以上はカンマ区切りで返す（12453 → "12,453"）', () => {
    expect(formatGames(12453)).toBe('12,453');
  });

  it('100万以上もカンマ区切りで返す（1234567 → "1,234,567"）', () => {
    expect(formatGames(1234567)).toBe('1,234,567');
  });

  it('0は"0"を返す', () => {
    expect(formatGames(0)).toBe('0');
  });
});
