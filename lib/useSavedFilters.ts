'use client';

// 絞り込み条件を覚えておくための Hook（01 FR-08、03 の 5章）
import { useEffect, useState } from 'react';
import { loadFilters, saveFilters } from '@/lib/filterStorage';
import type { Filters } from '@/lib/filterStorage';
import type { Lane, Region, Tier } from '@/lib/constants';

export interface SavedFiltersState extends Filters {
  setLane: (lane: Lane) => void;
  setRegion: (region: Region) => void;
  setTier: (tier: Tier) => void;
  // 保存値の読み込みが終わったか。false のあいだは、呼び出し側は API を呼ばない（03 の 5.4）
  ready: boolean;
}

export function useSavedFilters(defaults: Filters): SavedFiltersState {
  const [filters, setFilters] = useState<Filters>(defaults);
  const [ready, setReady] = useState(false);

  // 保存値はブラウザにしかないので、マウントの後に読む
  // （最初の描画で読むと、サーバーで描いた HTML と食い違う）
  // 依存配列が空なのは、画面を開いたときに1回だけ読むため
  useEffect(() => {
    const saved = loadFilters();
    // ブラウザの保存領域（React の外）の値を、マウントの後に1回だけ取り込む。
    // 最初の描画では読めないので、effect の中で state に入れる
    /* eslint-disable react-hooks/set-state-in-effect */
    setFilters(prev => ({ ...prev, ...saved }));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 利用者が変えたときだけ保存する（読み込んだだけでは保存しない）
  const update = (changed: Partial<Filters>): void => {
    const next = { ...filters, ...changed };
    setFilters(next);
    saveFilters(next);
  };

  return {
    ...filters,
    setLane: lane => update({ lane }),
    setRegion: region => update({ region }),
    setTier: tier => update({ tier }),
    ready,
  };
}
