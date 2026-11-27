'use client';

import { useEffect, useState } from 'react';

// 画面に出す文言（03 の 6章）
export const PATCHES_ERROR_MESSAGE = 'パッチの一覧を取得できませんでした。ページを読み込み直してください。';
export const PATCHES_EMPTY_MESSAGE = '表示できるパッチがありません。';
export const DATA_ERROR_MESSAGE    = 'データを取得できませんでした。ページを読み込み直してください。';

export interface ApiListState<T> {
  /** 取得できた行。読み込み中・失敗のときは空 */
  rows: T[];
  isLoading: boolean;
  hasError: boolean;
}

interface Loaded<T> {
  url: string;
  rows: T[];
  hasError: boolean;
}

/**
 * 配列を返す API（/api/patches・/api/champions・/api/counter）を読む（03 の 6章）
 * url が null のあいだは呼ばない。url が変わると呼び直す
 */
export function useApiList<T>(url: string | null): ApiListState<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    if (url === null) return;
    // 条件を続けて変えたとき、遅れて届いた前の応答で上書きしないため
    let isCancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error('応答が配列でない');
        // 配列であることは上で確かめた。要素の形は 05 API設計書のとおりに返す自分たちの API なので確かめない
        if (!isCancelled) setLoaded({ url, rows: body as T[], hasError: false });
      } catch {
        // 通信の失敗・エラーの応答・想定外の形は、どれも「取得できなかった」として画面に出す（03 の 6章）
        if (!isCancelled) setLoaded({ url, rows: [], hasError: true });
      }
    };
    void load();
    return () => { isCancelled = true; };
  }, [url]);

  // 今の url の結果だけを使う。読み込み中かどうかを state に持たず、結果の有無から決める（effect の中で同期的に setState しないため）
  const current = url !== null && loaded?.url === url ? loaded : null;
  return {
    rows: current?.rows ?? [],
    isLoading: url !== null && current === null,
    hasError: current?.hasError ?? false,
  };
}
