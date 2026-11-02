import { describe, it, expect } from 'vitest';
import {
  rankToPoints, pointsToCollectTier, rankTiersForPoints, averageMatchPoints,
  parseTargetTiers, pickNextTier, UNKNOWN_PLAYER_POINTS,
} from './rank';

describe('rankToPoints', () => {
  it('段階と LP をポイントにする', () => {
    expect(rankToPoints('PLATINUM', 'IV', 0)).toBe(1600);
    expect(rankToPoints('DIAMOND', 'I', 50)).toBe(2750);
    expect(rankToPoints('GOLD', 'II', 50)).toBe(UNKNOWN_PLAYER_POINTS);
  });

  it('段階内の LP は 99 で打ち切る（昇格戦中の 100LP で次の段階にならない）', () => {
    expect(rankToPoints('EMERALD', 'I', 100)).toBe(2399);
  });

  it('Master 以上は 2800 + LP（LP は 400 で打ち切る）', () => {
    expect(rankToPoints('MASTER', 'I', 120)).toBe(2920);
    expect(rankToPoints('CHALLENGER', 'I', 1500)).toBe(3200);
  });

  it('不明な tier・division は null', () => {
    expect(rankToPoints('UNRANKED', 'I', 0)).toBeNull();
    expect(rankToPoints('GOLD', 'V', 0)).toBeNull();
  });
});

describe('pointsToCollectTier', () => {
  it('境界値でランクが切り替わる', () => {
    expect(pointsToCollectTier(1599)).toBeNull();
    expect(pointsToCollectTier(1600)).toBe('PLATINUM');
    expect(pointsToCollectTier(2000)).toBe('EMERALD');
    expect(pointsToCollectTier(2400)).toBe('DIAMOND');
    expect(pointsToCollectTier(2800)).toBe('MASTER');
  });
});

describe('rankTiersForPoints', () => {
  it('_plus はそのランク以上を含むので、上のランクほど多くのランク帯に入る', () => {
    expect(rankTiersForPoints(1500)).toEqual(['all']);
    expect(rankTiersForPoints(1600)).toEqual(['all', 'platinum_plus']);
    expect(rankTiersForPoints(2100)).toEqual(['all', 'platinum_plus']); // Emerald は platinum_plus
    expect(rankTiersForPoints(2400)).toEqual(['all', 'platinum_plus', 'diamond_plus']);
    expect(rankTiersForPoints(2900)).toEqual(['all', 'platinum_plus', 'diamond_plus', 'master_plus']);
  });
});

describe('averageMatchPoints', () => {
  it('名簿にいない人（null）は Gold 相当として平均に入れる', () => {
    expect(averageMatchPoints([2400, null])).toBe((2400 + UNKNOWN_PLAYER_POINTS) / 2);
  });

  it('全員が名簿にいれば単純平均', () => {
    expect(averageMatchPoints([1600, 2000, 2400])).toBe(2000);
  });
});

describe('parseTargetTiers', () => {
  it('未指定・空なら4ランクすべて', () => {
    expect(parseTargetTiers(undefined)).toEqual(['PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER']);
    expect(parseTargetTiers(' ')).toEqual(['PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER']);
  });

  it('大文字小文字・空白・順番・重複を整える', () => {
    expect(parseTargetTiers(' diamond, platinum ,PLATINUM')).toEqual(['PLATINUM', 'DIAMOND']);
  });

  it('不正な値はエラー', () => {
    expect(() => parseTargetTiers('PLATINUM,GOLD')).toThrow('GOLD');
  });
});

describe('pickNextTier', () => {
  const counts = { PLATINUM: 3, EMERALD: 1, DIAMOND: 2, MASTER: 0 };

  it('集めた試合数が最も少ないランクを選ぶ', () => {
    expect(pickNextTier(['PLATINUM', 'EMERALD', 'DIAMOND'], counts, () => true)).toBe('EMERALD');
  });

  it('作業が残っていないランクは飛ばす', () => {
    expect(pickNextTier(['PLATINUM', 'EMERALD', 'MASTER'], counts, t => t !== 'MASTER')).toBe('EMERALD');
  });

  it('どのランクにも作業がなければ null', () => {
    expect(pickNextTier(['PLATINUM'], counts, () => false)).toBeNull();
  });
});
