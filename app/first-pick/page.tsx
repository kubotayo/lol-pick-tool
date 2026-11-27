'use client';

import { useState } from 'react';
import type { ChangeEvent } from 'react';
import Image from 'next/image';
import AppHeader from '@/components/AppHeader';
import { LANES, REGIONS, TIERS, TIER_NAMES } from '@/lib/constants';
import { getTierLabel, getWinRateColor, formatWinRate, formatGames } from '@/lib/utils';
import { DATA_ERROR_MESSAGE, PATCHES_EMPTY_MESSAGE, PATCHES_ERROR_MESSAGE, useApiList } from '@/lib/useApiList';
import { useSavedFilters } from '@/lib/useSavedFilters';
import type { ChampionStatRow, Tier_Label } from '@/lib/types';

const TIER_COLORS: Record<Tier_Label, string> = {
  S: '#ffd700', A: '#ff6b35', B: '#4169e1', C: '#6b7280',
};
const TIER_LABEL_ORDER: readonly Tier_Label[] = ['S', 'A', 'B', 'C'];

export default function FirstPickPage() {
  // レーン・ランク帯・リージョンは覚えておく（01 FR-08）。パッチは覚えず、開くたびに最新を選ぶ（FR-03）
  const { lane, region, tier, setLane, setRegion, setTier, isReady } =
    useSavedFilters({ lane: 'MID', region: 'JP', tier: 'platinum_plus' });
  const patchList = useApiList<string>('/api/patches');
  const patches = patchList.rows;
  // 利用者が選ぶまでは、一覧の先頭（最新）を選ぶ
  const [selectedPatch, setSelectedPatch] = useState<string | null>(null);
  const patch = selectedPatch ?? patches[0] ?? '';

  // 保存値を読み終える前に、既定値で取りにいかない（03 の 5.4）
  const championList = useApiList<ChampionStatRow>(
    isReady && patch ? `/api/champions?lane=${lane}&patch=${patch}&region=${region}&tier=${tier}` : null
  );
  const data = championList.rows;
  const isPatchEmpty = !patchList.isLoading && !patchList.hasError && patches.length === 0;
  const isLoading = patchList.isLoading || (patch !== '' && (!isReady || championList.isLoading));

  // select の値は文字列で届くため、許可値の中から探して型を決める
  const handleRegionChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const next = REGIONS.find(r => r === e.target.value);
    if (next) setRegion(next);
  };
  const handleTierChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const next = TIERS.find(t => t === e.target.value);
    if (next) setTier(next);
  };
  const handlePatchChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    setSelectedPatch(e.target.value);
  };

  const grouped = data.reduce<Record<Tier_Label, ChampionStatRow[]>>(
    (acc, row) => {
      const t = getTierLabel(row.win_rate);
      acc[t].push(row);
      return acc;
    },
    { S: [], A: [], B: [], C: [] }
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0e1a' }}>
      <AppHeader />

      {/* フィルターバー */}
      <div className="flex gap-3 items-center px-5 py-2.5 flex-wrap"
        style={{ background: '#111827', borderBottom: '1px solid #1f2937' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: '#6b7280' }}>リージョン</span>
          <select value={region} onChange={handleRegionChange}
            className="text-xs rounded px-2 py-1"
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#d1d5db' }}>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: '#6b7280' }}>ランク帯</span>
          <select value={tier} onChange={handleTierChange}
            className="text-xs rounded px-2 py-1"
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#d1d5db' }}>
            {TIERS.map(t => <option key={t} value={t}>{TIER_NAMES[t]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: '#6b7280' }}>パッチ</span>
          <select value={patch} onChange={handlePatchChange}
            className="text-xs rounded px-2 py-1"
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#d1d5db' }}>
            {patches.map(p => <option key={p} value={p}>{p}{p === patches[0] ? ' (最新)' : ''}</option>)}
          </select>
        </div>
      </div>

      {/* レーン選択 */}
      <div className="px-5 py-3" style={{ background: '#0f1624', borderBottom: '1px solid #1f2937' }}>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>レーン選択</p>
        <div className="flex gap-2">
          {LANES.map(l => (
            <button key={l} onClick={() => setLane(l)}
              className="px-4 py-1.5 rounded text-xs font-semibold border transition-colors"
              style={lane === l
                ? { background: '#c89b3c', borderColor: '#c89b3c', color: '#1a1a2e' }
                : { background: '#1f2937', borderColor: '#374151', color: '#9ca3af' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* チャンピオンリスト */}
      <div className="flex-1 overflow-y-auto p-4">
        {patchList.hasError ? (
          <p role="alert" className="text-center py-10 text-sm" style={{ color: '#f87171' }}>{PATCHES_ERROR_MESSAGE}</p>
        ) : isPatchEmpty ? (
          <p className="text-center py-10 text-sm" style={{ color: '#6b7280' }}>{PATCHES_EMPTY_MESSAGE}</p>
        ) : championList.hasError ? (
          <p role="alert" className="text-center py-10 text-sm" style={{ color: '#f87171' }}>{DATA_ERROR_MESSAGE}</p>
        ) : isLoading ? (
          <p className="text-center py-10 text-sm" style={{ color: '#6b7280' }}>読み込み中...</p>
        ) : data.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: '#6b7280' }}>データがありません</p>
        ) : (
          TIER_LABEL_ORDER.map((t, tierIndex) => grouped[t].length > 0 && (
            <div key={t} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded flex items-center justify-center text-sm font-black"
                  style={{ background: TIER_COLORS[t], color: t === 'S' ? '#1a1a2e' : 'white' }}>
                  {t}
                </div>
                <div className="flex-1 border-t" style={{ borderColor: '#1f2937' }} />
                <span className="text-xs" style={{ color: '#6b7280' }}>{grouped[t].length}体</span>
              </div>
              {grouped[t].map((row, i) => {
                // 全体での順位。上の Tier の人数に、この Tier の中の順番を足す
                const rankNum = TIER_LABEL_ORDER.slice(0, tierIndex).reduce((sum, upper) => sum + grouped[upper].length, 0) + i + 1;
                return (
                  <div key={row.champions.champion_id}
                    className="flex items-center gap-3 rounded px-3 py-2 mb-1"
                    style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <span className="text-xs w-5 text-center" style={{ color: '#4b5563' }}>{rankNum}</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0"
                      style={{ borderColor: '#374151' }}>
                      <Image src={row.champions.image_url} alt={row.champions.champion_name}
                        width={32} height={32} className="w-full h-full object-cover"
                        unoptimized />
                    </div>
                    <span className="text-xs font-semibold flex-1" style={{ color: '#e5e7eb' }}>
                      {row.champions.champion_name}
                    </span>
                    <span className={`text-xs font-bold ${getWinRateColor(row.win_rate)}`}>
                      {formatWinRate(row.win_rate)}
                    </span>
                    <span className="text-xs min-w-[70px] text-right" style={{ color: '#6b7280' }}>
                      {formatGames(row.games_played)} games
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
