// 絞り込み条件（レーン・ランク帯・リージョン）をブラウザに保存する（01 FR-08、03 の 5章）
import { LANES, REGIONS, TIERS } from '@/lib/constants';
import type { Lane, Region, Tier } from '@/lib/constants';

export const FILTER_STORAGE_KEY = 'lol-pick-tool:filters';

// 保存する値の形式のバージョン。形式を変えたら上げる（古い形式の値は読まずに既定値に戻すため）
const FORMAT_VERSION = 1;

// 保存する3項目
export interface Filters {
  lane: Lane;
  region: Region;
  tier: Tier;
}

// 読み込んだ値。使える項目だけを持つ（使えない項目は、呼び出し側が既定値にする）
export interface SavedFilters {
  lane?: Lane;
  region?: Region;
  tier?: Tier;
}

// 値が許可値の一覧にあるかを確かめる（保存された値は、手で書き換えられたり古い選択肢だったりするため）
function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && allowed.some(a => a === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadFilters(): SavedFilters {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw === null) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== FORMAT_VERSION) return {};

    const saved: SavedFilters = {};
    if (isOneOf(LANES, parsed.lane)) saved.lane = parsed.lane;
    if (isOneOf(REGIONS, parsed.region)) saved.region = parsed.region;
    if (isOneOf(TIERS, parsed.tier)) saved.tier = parsed.tier;
    return saved;
  } catch {
    // localStorage が使えない設定のブラウザや、JSON として読めない値では、保存なしとして扱う
    return {};
  }
}

export function saveFilters(filters: Filters): void {
  try {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ v: FORMAT_VERSION, lane: filters.lane, region: filters.region, tier: filters.tier }),
    );
  } catch {
    // 保存できないブラウザ（保存を許さない設定・容量の上限）では、覚えないだけにする。画面は止めない
  }
}
