// 一覧を返す API を読む Hook（03 の 6章）のテスト
// テスト名の先頭の ID は docs/07_ui-test-spec.html の項目 ID と対応する
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiList } from './useApiList';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// URL ごとに、テストが好きな時点で応答を返せるようにする（応答が届く順序を入れ替えるため）
let pending: Map<string, (response: Response) => void>;
let calls: string[];

async function respond(url: string, body: unknown, status = 200): Promise<void> {
  const resolve = pending.get(url);
  if (!resolve) throw new Error(`${url} は呼ばれていない`);
  await act(async () => {
    resolve(jsonResponse(body, status));
    await new Promise((done) => setTimeout(done, 20));
  });
}

beforeEach(() => {
  pending = new Map();
  calls = [];
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Promise<Response>((resolve) => { pending.set(url, resolve); });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useApiList', () => {
  it('AL-01 url が null のあいだは呼ばず、読み込み中にもしない', async () => {
    const { result } = renderHook(() => useApiList<string>(null));

    await act(async () => { await new Promise((done) => setTimeout(done, 20)); });
    expect(calls).toStrictEqual([]);
    expect(result.current).toStrictEqual({ rows: [], isLoading: false, hasError: false });
  });

  it('AL-02 応答が届くまでは読み込み中で、届いたら行を返す', async () => {
    const { result } = renderHook(() => useApiList<string>('/api/a'));

    expect(result.current).toStrictEqual({ rows: [], isLoading: true, hasError: false });
    await respond('/api/a', ['x', 'y']);
    expect(result.current).toStrictEqual({ rows: ['x', 'y'], isLoading: false, hasError: false });
    expect(calls).toStrictEqual(['/api/a']);
  });

  it('AL-03 url が変わると、新しい応答が届くまでは前の行を返さず、読み込み中にする', async () => {
    const { result, rerender } = renderHook(({ url }: { url: string }) => useApiList<string>(url), {
      initialProps: { url: '/api/a' },
    });
    await respond('/api/a', ['a']);

    rerender({ url: '/api/b' });

    await waitFor(() => { expect(calls).toStrictEqual(['/api/a', '/api/b']); });
    expect(result.current).toStrictEqual({ rows: [], isLoading: true, hasError: false });
    await respond('/api/b', ['b']);
    expect(result.current).toStrictEqual({ rows: ['b'], isLoading: false, hasError: false });
  });

  it('AL-04 前の url の応答が、後の url の応答より遅く届いても、後の url の行を返し続ける', async () => {
    const { result, rerender } = renderHook(({ url }: { url: string }) => useApiList<string>(url), {
      initialProps: { url: '/api/a' },
    });
    rerender({ url: '/api/b' });
    await waitFor(() => { expect(calls).toStrictEqual(['/api/a', '/api/b']); });

    await respond('/api/b', ['b']);
    await respond('/api/a', ['a']);

    expect(result.current).toStrictEqual({ rows: ['b'], isLoading: false, hasError: false });
  });

  it('AL-05 失敗した後に url が変わると、失敗の状態を引き継がない', async () => {
    const { result, rerender } = renderHook(({ url }: { url: string }) => useApiList<string>(url), {
      initialProps: { url: '/api/a' },
    });
    await respond('/api/a', { error: 'Internal Server Error' }, 500);
    expect(result.current).toStrictEqual({ rows: [], isLoading: false, hasError: true });

    rerender({ url: '/api/b' });

    await waitFor(() => { expect(calls).toStrictEqual(['/api/a', '/api/b']); });
    expect(result.current).toStrictEqual({ rows: [], isLoading: true, hasError: false });
  });
});
