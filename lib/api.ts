// API Routes 共通の処理（入力チェック・応答・キャッシュ）。仕様は docs/05_api-design.html
import { NextResponse } from 'next/server';

// 集計データは1日1回のバッチでしか変わらないため、Vercel の CDN に1時間キャッシュする（05 の1章）
const CACHE_CONTROL_OK    = 's-maxage=3600, stale-while-revalidate=86400';
const CACHE_CONTROL_ERROR = 'no-store';

const PATCH_PATTERN = /^\d+\.\d+$/;

export function okResponse(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: { 'Cache-Control': CACHE_CONTROL_OK } });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL_ERROR } });
}

/** DB エラーなど。内部の情報は返さず、詳細はサーバーのログに出す */
export function internalError(err: unknown): NextResponse {
  console.error('[api] 内部エラー:', err);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL_ERROR } });
}

export function isValidPatch(value: string | null): value is string {
  return value !== null && PATCH_PATTERN.test(value);
}

/**
 * 整数のクエリパラメーターを読む
 * 未指定なら defaultValue、min 未満や整数でなければ null（呼び出し側で 400 にする）
 */
export function parseIntParam(value: string | null, defaultValue: number, min: number): number | null {
  if (value === null || value === '') return defaultValue;
  if (!/^-?\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min ? n : null;
}

/** パッチ番号を新しい順に並べる（文字列で比べると 14.9 が 14.10 より新しくなるため、数値で比べる） */
export function sortPatchesDesc(patches: string[]): string[] {
  const toNumbers = (p: string) => p.split('.').map(Number);
  return [...patches].sort((a, b) => {
    const [aMajor, aMinor] = toNumbers(a);
    const [bMajor, bMinor] = toNumbers(b);
    return bMajor - aMajor || bMinor - aMinor;
  });
}
