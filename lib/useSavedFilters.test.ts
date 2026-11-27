// 絞り込み条件を覚えるフック（01 FR-08、03 の 5.2・5.4・5.5）の単体テスト
// テスト名の先頭の ID は docs/07_ui-test-spec.html の項目 ID と対応する
// 期待結果は設計書（03 の 5章）から決めている。実装のコードからは決めていない
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lane, Region, Tier } from './constants';
import { loadFilters, saveFilters } from './filterStorage';
import { useSavedFilters } from './useSavedFilters';

// loadFilters・saveFilters を「本物を呼ぶスパイ」に差し替える
// 呼ばれた回数・引数と、localStorage に実際に書かれた値の両方を確かめるため
vi.mock('./filterStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./filterStorage')>();
  return {
    ...actual,
    loadFilters: vi.fn(actual.loadFilters),
    saveFilters: vi.fn(actual.saveFilters),
  };
});

const KEY = 'lol-pick-tool:filters';

interface Filters {
  lane: Lane;
  region: Region;
  tier: Tier;
}

interface Snapshot extends Filters {
  ready: boolean;
}

// 先出しピックの既定値（03 の 5.1）
const FIRST_PICK_DEFAULTS: Filters = { lane: 'MID', region: 'JP', tier: 'platinum_plus' };
// カウンターピックの既定値（03 の 5.1）
const COUNTER_PICK_DEFAULTS: Filters = { lane: 'TOP', region: 'JP', tier: 'platinum_plus' };

function seed(value: unknown): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

// フックを描画し、描画ごとの戻り値を順に記録する
// renderHook が返す result.current はマウント後の値なので、最初の描画の値は記録からしか見られない
// defaults は画面と同じく、描画のたびに新しいオブジェクトで渡す（同じ参照を前提にした実装を見逃さないため）
function renderSavedFilters(defaults: Filters) {
  const renders: Snapshot[] = [];
  const hook = renderHook(() => {
    const value = useSavedFilters({ ...defaults });
    renders.push({ lane: value.lane, region: value.region, tier: value.tier, ready: value.ready });
    return value;
  });
  return { ...hook, renders };
}

function current(result: { current: ReturnType<typeof useSavedFilters> }): Snapshot {
  const { lane, region, tier, ready } = result.current;
  return { lane, region, tier, ready };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadFilters).mockClear();
  vi.mocked(saveFilters).mockClear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useSavedFilters', () => {
  describe('最初の描画', () => {
    it('HK-01 保存値があっても、最初の描画は defaults と ready: false', () => {
      seed({ v: 1, lane: 'TOP', region: 'KR', tier: 'diamond_plus' });

      const { renders } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      expect(renders[0]).toStrictEqual({ lane: 'MID', region: 'JP', tier: 'platinum_plus', ready: false });
    });

    it('HK-02 保存値がなくても、最初の描画は ready: false', () => {
      const { renders } = renderSavedFilters(COUNTER_PICK_DEFAULTS);

      expect(renders[0]).toStrictEqual({ lane: 'TOP', region: 'JP', tier: 'platinum_plus', ready: false });
    });
  });

  describe('マウントの後', () => {
    it('HK-03 保存値がなければ、defaults と ready: true', () => {
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      expect(current(result)).toStrictEqual({ lane: 'MID', region: 'JP', tier: 'platinum_plus', ready: true });
    });

    it('HK-04 defaults のレーンが TOP なら、保存値がないときのレーンは TOP', () => {
      const { result } = renderSavedFilters(COUNTER_PICK_DEFAULTS);

      expect(current(result)).toStrictEqual({ lane: 'TOP', region: 'JP', tier: 'platinum_plus', ready: true });
    });

    it('HK-05 3項目とも保存値があれば、3項目とも保存値と ready: true', () => {
      seed({ v: 1, lane: 'SUP', region: 'KR', tier: 'master_plus' });

      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      expect(current(result)).toStrictEqual({ lane: 'SUP', region: 'KR', tier: 'master_plus', ready: true });
    });

    it('HK-06 ready: true の描画は、どれも保存値を反映している（既定値のまま ready: true になる描画がない）', () => {
      seed({ v: 1, lane: 'SUP', region: 'KR', tier: 'master_plus' });

      const { renders } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      const readyRenders = renders.filter((r) => r.ready);
      expect(readyRenders.length).toBeGreaterThanOrEqual(1);
      for (const r of readyRenders) {
        expect(r).toStrictEqual({ lane: 'SUP', region: 'KR', tier: 'master_plus', ready: true });
      }
    });

    it.each([
      ['レーンだけ使える', { v: 1, lane: 'JG', region: 'BR', tier: 'gold_plus' }, { lane: 'JG', region: 'JP', tier: 'platinum_plus' }],
      ['リージョンだけ使える', { v: 1, lane: 'ADC', region: 'EUW', tier: 'gold_plus' }, { lane: 'MID', region: 'EUW', tier: 'platinum_plus' }],
      ['ランク帯だけ使える', { v: 1, lane: 'ADC', region: 'BR', tier: 'all' }, { lane: 'MID', region: 'JP', tier: 'all' }],
      ['レーンだけ使えない', { v: 1, lane: 'ADC', region: 'KR', tier: 'diamond_plus' }, { lane: 'MID', region: 'KR', tier: 'diamond_plus' }],
      ['リージョンの項目がない', { v: 1, lane: 'BOT', tier: 'diamond_plus' }, { lane: 'BOT', region: 'JP', tier: 'diamond_plus' }],
    ])('HK-07 %s: 使える項目は保存値、使えない項目は defaults', (_label, saved, expected) => {
      seed(saved);

      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      expect(current(result)).toStrictEqual({ ...expected, ready: true });
    });

    it.each([
      ['JSON として読めない', 'not json'],
      ['v が 2', '{"v":2,"lane":"TOP","region":"KR","tier":"all"}'],
      ['オブジェクトでない', '"TOP"'],
    ])('HK-08 保存値の全体が使えない（%s）: 3項目とも defaults と ready: true', (_label, raw) => {
      localStorage.setItem(KEY, raw);

      const { result } = renderSavedFilters(COUNTER_PICK_DEFAULTS);

      expect(current(result)).toStrictEqual({ lane: 'TOP', region: 'JP', tier: 'platinum_plus', ready: true });
    });

    it('HK-09 loadFilters を1回だけ呼ぶ（描画し直しても増えない）', () => {
      seed({ v: 1, lane: 'SUP', region: 'KR', tier: 'master_plus' });

      const { rerender } = renderSavedFilters(FIRST_PICK_DEFAULTS);
      rerender();
      rerender();

      expect(loadFilters).toHaveBeenCalledTimes(1);
    });

    it('HK-10 ready が true になっただけでは saveFilters を呼ばず、保存値も変えない（保存値がない）', () => {
      const { result, rerender } = renderSavedFilters(FIRST_PICK_DEFAULTS);
      rerender();

      expect(result.current.ready).toBe(true);
      expect(saveFilters).not.toHaveBeenCalled();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('HK-11 ready が true になっただけでは saveFilters を呼ばず、保存値も変えない（一部が使えない保存値）', () => {
      const raw = '{"v":1,"lane":"ADC","region":"KR","tier":"diamond_plus"}';
      localStorage.setItem(KEY, raw);

      const { result, rerender } = renderSavedFilters(FIRST_PICK_DEFAULTS);
      rerender();

      expect(result.current.ready).toBe(true);
      expect(saveFilters).not.toHaveBeenCalled();
      // 使えない項目を既定値に直して書き戻す、ということをしない
      expect(localStorage.getItem(KEY)).toBe(raw);
    });
  });

  describe('setter', () => {
    it('HK-12 setLane: レーンを変え、変えた後の3項目を saveFilters に1回渡す', () => {
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      act(() => {
        result.current.setLane('JG');
      });

      expect(current(result)).toStrictEqual({ lane: 'JG', region: 'JP', tier: 'platinum_plus', ready: true });
      expect(saveFilters).toHaveBeenCalledTimes(1);
      expect(vi.mocked(saveFilters).mock.calls[0][0]).toStrictEqual({ lane: 'JG', region: 'JP', tier: 'platinum_plus' });
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'JG', region: 'JP', tier: 'platinum_plus',
      });
    });

    it('HK-13 setRegion: リージョンを変え、変えた後の3項目を saveFilters に1回渡す', () => {
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      act(() => {
        result.current.setRegion('EUNE');
      });

      expect(current(result)).toStrictEqual({ lane: 'MID', region: 'EUNE', tier: 'platinum_plus', ready: true });
      expect(saveFilters).toHaveBeenCalledTimes(1);
      expect(vi.mocked(saveFilters).mock.calls[0][0]).toStrictEqual({ lane: 'MID', region: 'EUNE', tier: 'platinum_plus' });
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'MID', region: 'EUNE', tier: 'platinum_plus',
      });
    });

    it('HK-14 setTier: ランク帯を変え、変えた後の3項目を saveFilters に1回渡す', () => {
      const { result } = renderSavedFilters(COUNTER_PICK_DEFAULTS);

      act(() => {
        result.current.setTier('all');
      });

      expect(current(result)).toStrictEqual({ lane: 'TOP', region: 'JP', tier: 'all', ready: true });
      expect(saveFilters).toHaveBeenCalledTimes(1);
      expect(vi.mocked(saveFilters).mock.calls[0][0]).toStrictEqual({ lane: 'TOP', region: 'JP', tier: 'all' });
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'TOP', region: 'JP', tier: 'all',
      });
    });

    it('HK-15 保存値を読み込んだ後の setter は、変えていない項目を保存値のまま渡す（defaults に戻さない）', () => {
      seed({ v: 1, lane: 'SUP', region: 'KR', tier: 'master_plus' });
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      act(() => {
        result.current.setTier('diamond_plus');
      });

      expect(vi.mocked(saveFilters).mock.calls[0][0]).toStrictEqual({ lane: 'SUP', region: 'KR', tier: 'diamond_plus' });
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'SUP', region: 'KR', tier: 'diamond_plus',
      });
    });

    it('HK-16 一部が使えない保存値の後の setter は、使えなかった項目を defaults の値で渡す', () => {
      seed({ v: 1, lane: 'ADC', region: 'KR', tier: 'diamond_plus' });
      const { result } = renderSavedFilters(COUNTER_PICK_DEFAULTS);

      act(() => {
        result.current.setRegion('NA');
      });

      expect(vi.mocked(saveFilters).mock.calls[0][0]).toStrictEqual({ lane: 'TOP', region: 'NA', tier: 'diamond_plus' });
    });

    it('HK-17 setter を順に3回呼ぶと、前の変更を引き継いだ3項目を毎回渡す', () => {
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      act(() => {
        result.current.setLane('BOT');
      });
      act(() => {
        result.current.setRegion('KR');
      });
      act(() => {
        result.current.setTier('master_plus');
      });

      expect(saveFilters).toHaveBeenCalledTimes(3);
      expect(vi.mocked(saveFilters).mock.calls[0][0]).toStrictEqual({ lane: 'BOT', region: 'JP', tier: 'platinum_plus' });
      expect(vi.mocked(saveFilters).mock.calls[1][0]).toStrictEqual({ lane: 'BOT', region: 'KR', tier: 'platinum_plus' });
      expect(vi.mocked(saveFilters).mock.calls[2][0]).toStrictEqual({ lane: 'BOT', region: 'KR', tier: 'master_plus' });
      expect(current(result)).toStrictEqual({ lane: 'BOT', region: 'KR', tier: 'master_plus', ready: true });
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toStrictEqual({
        v: 1, lane: 'BOT', region: 'KR', tier: 'master_plus',
      });
    });

    it('HK-18 setter の後も loadFilters は呼び直さない', () => {
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

      act(() => {
        result.current.setLane('JG');
      });
      act(() => {
        result.current.setTier('all');
      });

      expect(loadFilters).toHaveBeenCalledTimes(1);
    });

    it('HK-19 作り直したフック（画面を開き直した状態）は、前に保存した値を読み込む', () => {
      const first = renderSavedFilters(FIRST_PICK_DEFAULTS);
      act(() => {
        first.result.current.setLane('JG');
      });
      act(() => {
        first.result.current.setRegion('KR');
      });
      first.unmount();

      // 別の画面（カウンターピック）の defaults で開く
      const second = renderSavedFilters(COUNTER_PICK_DEFAULTS);

      expect(second.renders[0]).toStrictEqual({ lane: 'TOP', region: 'JP', tier: 'platinum_plus', ready: false });
      expect(current(second.result)).toStrictEqual({ lane: 'JG', region: 'KR', tier: 'platinum_plus', ready: true });
    });
  });

  describe('localStorage が使えない', () => {
    it('HK-20 読み込みが例外を投げても、defaults と ready: true になる', () => {
      seed({ v: 1, lane: 'SUP', region: 'KR', tier: 'master_plus' });
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      try {
        const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);

        expect(current(result)).toStrictEqual({ lane: 'MID', region: 'JP', tier: 'platinum_plus', ready: true });
        // 例外の経路を実際に通ったことを確かめる
        expect(getItem).toHaveBeenCalled();
      } finally {
        getItem.mockRestore();
      }
    });

    it('HK-21 書き込みが例外を投げても、setter は例外を投げず、値は変わる', () => {
      const { result } = renderSavedFilters(FIRST_PICK_DEFAULTS);
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      });
      try {
        expect(() => {
          act(() => {
            result.current.setLane('SUP');
          });
        }).not.toThrow();

        expect(current(result)).toStrictEqual({ lane: 'SUP', region: 'JP', tier: 'platinum_plus', ready: true });
        // 例外の経路を実際に通ったことを確かめる
        expect(setItem).toHaveBeenCalledTimes(1);
      } finally {
        setItem.mockRestore();
      }
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });
});
