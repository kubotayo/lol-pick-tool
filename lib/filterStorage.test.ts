// 絞り込み条件の保存（01 FR-08、03 の 5.1〜5.3・5.5）の単体テスト
// テスト名の先頭の ID は docs/07_ui-test-spec.html の項目 ID と対応する
// 期待結果は設計書（03 の 5章）から決めている。実装のコードからは決めていない
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANES, REGIONS, TIERS } from './constants';
import { FILTER_STORAGE_KEY, loadFilters, saveFilters } from './filterStorage';

const KEY = 'lol-pick-tool:filters';

// 保存値を JSON の文字列にして書き込む（テストの準備用。saveFilters は使わない: 読み込みのテストを書き込みの実装に頼らせないため）
function seed(value: unknown): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

function seedRaw(raw: string): void {
  localStorage.setItem(KEY, raw);
}

// localStorage を参照しただけで例外になる状態を作る（サイトのデータの保存を禁止した Chrome と同じ動き）
// 戻り値の関数で元に戻す
function blockLocalStorageAccess(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // 先にスパイを外す（外す前に clear すると、例外を投げるスパイに当たるため）
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('FILTER_STORAGE_KEY', () => {
  it('FS-01 キーは lol-pick-tool:filters', () => {
    expect(FILTER_STORAGE_KEY).toBe('lol-pick-tool:filters');
  });
});

describe('loadFilters', () => {
  describe('正常', () => {
    it('FS-02 3項目とも許可値なら、3項目を返す', () => {
      seed({ v: 1, lane: 'MID', region: 'JP', tier: 'platinum_plus' });
      expect(loadFilters()).toStrictEqual({ lane: 'MID', region: 'JP', tier: 'platinum_plus' });
    });

    it.each(LANES.map((lane) => [lane]))('FS-03 レーンの許可値 %s はそのまま返す', (lane) => {
      seed({ v: 1, lane, region: 'KR', tier: 'all' });
      expect(loadFilters()).toStrictEqual({ lane, region: 'KR', tier: 'all' });
    });

    it.each(REGIONS.map((region) => [region]))('FS-04 リージョンの許可値 %s はそのまま返す', (region) => {
      seed({ v: 1, lane: 'SUP', region, tier: 'all' });
      expect(loadFilters()).toStrictEqual({ lane: 'SUP', region, tier: 'all' });
    });

    it.each(TIERS.map((tier) => [tier]))('FS-05 ランク帯の許可値 %s はそのまま返す', (tier) => {
      seed({ v: 1, lane: 'SUP', region: 'KR', tier });
      expect(loadFilters()).toStrictEqual({ lane: 'SUP', region: 'KR', tier });
    });

    it('FS-06 3項目のほかのプロパティ（patch など）は返さない', () => {
      seed({ v: 1, lane: 'TOP', region: 'KR', tier: 'diamond_plus', patch: '16.22', enemy: 58, search: 'ガレン' });
      expect(loadFilters()).toStrictEqual({ lane: 'TOP', region: 'KR', tier: 'diamond_plus' });
    });
  });

  describe('全体が使えない（3項目とも持たない {} を返す）', () => {
    it('FS-07 キーがない', () => {
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(loadFilters()).toStrictEqual({});
    });

    it('FS-08 別のキーにだけ値がある', () => {
      localStorage.setItem('filters', JSON.stringify({ v: 1, lane: 'TOP', region: 'KR', tier: 'all' }));
      localStorage.setItem('lol-pick-tool:filter', JSON.stringify({ v: 1, lane: 'TOP', region: 'KR', tier: 'all' }));
      expect(loadFilters()).toStrictEqual({});
    });

    it.each([
      ['空文字', ''],
      ['JSON でない文字列', 'not json'],
      ['途中で切れた JSON', '{"v":1,"lane":"MID"'],
      ['シングルクォートの JSON', "{'v':1,'lane':'MID'}"],
    ])('FS-09 JSON として読めない: %s', (_label, raw) => {
      seedRaw(raw);
      expect(() => loadFilters()).not.toThrow();
      expect(loadFilters()).toStrictEqual({});
    });

    it.each([
      ['null', 'null'],
      ['文字列', '"MID"'],
      ['数値', '1'],
      ['真偽値', 'true'],
      ['配列', '[{"v":1,"lane":"MID","region":"JP","tier":"all"}]'],
    ])('FS-10 オブジェクトでない: %s', (_label, raw) => {
      seedRaw(raw);
      expect(() => loadFilters()).not.toThrow();
      expect(loadFilters()).toStrictEqual({});
    });

    it.each([
      ['v がない', { lane: 'TOP', region: 'KR', tier: 'all' }],
      ['v が 0', { v: 0, lane: 'TOP', region: 'KR', tier: 'all' }],
      ['v が 2', { v: 2, lane: 'TOP', region: 'KR', tier: 'all' }],
      ['v が文字列の "1"', { v: '1', lane: 'TOP', region: 'KR', tier: 'all' }],
      ['v が null', { v: null, lane: 'TOP', region: 'KR', tier: 'all' }],
      ['v が true', { v: true, lane: 'TOP', region: 'KR', tier: 'all' }],
    ])('FS-11 v が 1 でない: %s（ほかの項目が許可値でも使わない）', (_label, value) => {
      seed(value);
      expect(loadFilters()).toStrictEqual({});
    });

    it('FS-12 v は 1 だが、3項目とも許可値にない', () => {
      seed({ v: 1, lane: 'ADC', region: 'BR', tier: 'gold_plus' });
      expect(loadFilters()).toStrictEqual({});
    });

    it('FS-13 v は 1 だが、3項目ともない', () => {
      seed({ v: 1 });
      expect(loadFilters()).toStrictEqual({});
    });
  });

  describe('一部の項目が使えない（その項目だけプロパティを持たない）', () => {
    it.each([
      ['許可値にない文字列', 'ADC'],
      ['小文字', 'mid'],
      ['前後に空白', ' MID '],
      ['空文字', ''],
      ['数値', 2],
      ['null', null],
      ['真偽値', true],
      ['配列', ['MID']],
      ['オブジェクト', { lane: 'MID' }],
      ['Object.prototype にある名前 toString', 'toString'],
      ['Object.prototype にある名前 constructor', 'constructor'],
      ['配列のメソッドの名前 length', 'length'],
    ])('FS-14 レーンが使えない: %s', (_label, lane) => {
      seed({ v: 1, lane, region: 'KR', tier: 'diamond_plus' });
      const result = loadFilters();
      expect(result).toStrictEqual({ region: 'KR', tier: 'diamond_plus' });
      expect('lane' in result).toBe(false);
    });

    it('FS-15 レーンの項目がない', () => {
      seed({ v: 1, region: 'KR', tier: 'diamond_plus' });
      const result = loadFilters();
      expect(result).toStrictEqual({ region: 'KR', tier: 'diamond_plus' });
      expect('lane' in result).toBe(false);
    });

    it.each([
      ['許可値にない文字列', 'BR'],
      ['小文字', 'jp'],
      ['Riot のプラットフォーム名', 'jp1'],
      ['数値', 1],
      ['null', null],
      ['配列', ['JP']],
      ['Object.prototype にある名前 valueOf', 'valueOf'],
    ])('FS-16 リージョンが使えない: %s', (_label, region) => {
      seed({ v: 1, lane: 'TOP', region, tier: 'diamond_plus' });
      const result = loadFilters();
      expect(result).toStrictEqual({ lane: 'TOP', tier: 'diamond_plus' });
      expect('region' in result).toBe(false);
    });

    it('FS-17 リージョンの項目がない', () => {
      seed({ v: 1, lane: 'TOP', tier: 'diamond_plus' });
      const result = loadFilters();
      expect(result).toStrictEqual({ lane: 'TOP', tier: 'diamond_plus' });
      expect('region' in result).toBe(false);
    });

    it.each([
      ['許可値にない文字列', 'gold_plus'],
      ['画面の表示名', 'Diamond+'],
      ['_plus がない', 'platinum'],
      ['大文字', 'ALL'],
      ['数値', 0],
      ['null', null],
      ['配列', ['all']],
      ['Object.prototype にある名前 hasOwnProperty', 'hasOwnProperty'],
    ])('FS-18 ランク帯が使えない: %s', (_label, tier) => {
      seed({ v: 1, lane: 'TOP', region: 'KR', tier });
      const result = loadFilters();
      expect(result).toStrictEqual({ lane: 'TOP', region: 'KR' });
      expect('tier' in result).toBe(false);
    });

    it('FS-19 ランク帯の項目がない', () => {
      seed({ v: 1, lane: 'TOP', region: 'KR' });
      const result = loadFilters();
      expect(result).toStrictEqual({ lane: 'TOP', region: 'KR' });
      expect('tier' in result).toBe(false);
    });

    it('FS-20 2項目が使えなければ、残りの1項目だけ返す', () => {
      seed({ v: 1, lane: 'ADC', region: 'EUNE', tier: 5 });
      expect(loadFilters()).toStrictEqual({ region: 'EUNE' });
    });
  });

  describe('localStorage が使えない', () => {
    it('FS-21 getItem が例外を投げても、例外を投げずに {} を返す', () => {
      seed({ v: 1, lane: 'TOP', region: 'KR', tier: 'all' });
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });

      let result: unknown;
      expect(() => {
        result = loadFilters();
      }).not.toThrow();
      expect(result).toStrictEqual({});
      // 例外の経路を実際に通ったことを確かめる（getItem を呼ばずに {} を返しても合格しないように）
      expect(getItem).toHaveBeenCalledWith(KEY);
    });

    it('FS-22 localStorage の参照そのものが例外を投げても、例外を投げずに {} を返す', () => {
      seed({ v: 1, lane: 'TOP', region: 'KR', tier: 'all' });
      const restore = blockLocalStorageAccess();
      try {
        // 前提: この状態で localStorage を参照すると例外になる（ならなければ、このテストは何も確かめていない）
        expect(() => window.localStorage).toThrow();

        let result: unknown;
        expect(() => {
          result = loadFilters();
        }).not.toThrow();
        expect(result).toStrictEqual({});
      } finally {
        restore();
      }
    });
  });

  describe('読み込むだけで書き込まない', () => {
    it('FS-23 使える値を読んでも、setItem・removeItem を呼ばない', () => {
      seed({ v: 1, lane: 'TOP', region: 'KR', tier: 'all' });
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

      loadFilters();

      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    });

    it('FS-24 使えない値を読んでも、保存されている文字列を変えない', () => {
      const raw = '{"v":2,"lane":"ADC"}';
      seedRaw(raw);

      loadFilters();

      expect(localStorage.getItem(KEY)).toBe(raw);
    });

    it('FS-25 キーがなくても、キーを作らない', () => {
      loadFilters();
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(localStorage.length).toBe(0);
    });
  });
});

describe('saveFilters', () => {
  describe('正常', () => {
    it('FS-26 v と3項目を JSON の文字列で書き込む', () => {
      saveFilters({ lane: 'MID', region: 'JP', tier: 'platinum_plus' });

      const raw = localStorage.getItem(KEY);
      expect(typeof raw).toBe('string');
      // typeof で文字列と確かめた後なので、null にはならない
      expect(JSON.parse(raw as string)).toStrictEqual({ v: 1, lane: 'MID', region: 'JP', tier: 'platinum_plus' });
    });

    it('FS-27 2回書き込むと、後の値で全体を上書きする（キーは1つのまま）', () => {
      saveFilters({ lane: 'MID', region: 'JP', tier: 'platinum_plus' });
      saveFilters({ lane: 'SUP', region: 'EUNE', tier: 'master_plus' });

      expect(localStorage.length).toBe(1);
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'SUP', region: 'EUNE', tier: 'master_plus',
      });
    });

    it('FS-28 使えない値が入っていても、新しい値で上書きする', () => {
      seedRaw('not json');
      saveFilters({ lane: 'JG', region: 'NA', tier: 'all' });

      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'JG', region: 'NA', tier: 'all',
      });
    });

    it('FS-29 ほかのキーの値を変えない', () => {
      localStorage.setItem('other-app:setting', 'keep');
      saveFilters({ lane: 'JG', region: 'NA', tier: 'all' });

      expect(localStorage.getItem('other-app:setting')).toBe('keep');
      expect(localStorage.length).toBe(2);
    });

    it.each(
      LANES.flatMap((lane) => REGIONS.flatMap((region) => TIERS.map((tier) => [lane, region, tier] as const))),
    )('FS-30 書き込んだ値を loadFilters で読むと同じ値になる: %s / %s / %s', (lane, region, tier) => {
      saveFilters({ lane, region, tier });
      expect(loadFilters()).toStrictEqual({ lane, region, tier });
    });
  });

  describe('localStorage が使えない', () => {
    it('FS-31 setItem が例外を投げても（容量の上限）、例外を投げず、前の値を残す', () => {
      seed({ v: 1, lane: 'MID', region: 'JP', tier: 'platinum_plus' });
      const before = localStorage.getItem(KEY);
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      });

      expect(() => saveFilters({ lane: 'TOP', region: 'KR', tier: 'all' })).not.toThrow();
      // 例外の経路を実際に通ったことを確かめる（setItem を呼ばずに終わっても合格しないように）
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem.mock.calls[0][0]).toBe(KEY);

      setItem.mockRestore();
      expect(localStorage.getItem(KEY)).toBe(before);
    });

    it('FS-32 localStorage の参照そのものが例外を投げても、例外を投げない', () => {
      const restore = blockLocalStorageAccess();
      try {
        expect(() => window.localStorage).toThrow();
        expect(() => saveFilters({ lane: 'TOP', region: 'KR', tier: 'all' })).not.toThrow();
      } finally {
        restore();
      }
      // 元に戻した後、何も書かれていない
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });
});
