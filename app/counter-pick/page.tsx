'use client';

import { useState } from 'react';
import type { ChangeEvent } from 'react';
import Image from 'next/image';
import AppHeader from '@/components/AppHeader';
import { LANES, REGIONS, TIERS, TIER_NAMES } from '@/lib/constants';
import { getWinRateColor, formatWinRate, formatGames } from '@/lib/utils';
import { DATA_ERROR_MESSAGE, PATCHES_EMPTY_MESSAGE, PATCHES_ERROR_MESSAGE, useApiList } from '@/lib/useApiList';
import { useSavedFilters } from '@/lib/useSavedFilters';
import type { ChampionStatRow, CounterStatRow } from '@/lib/types';

/** 選んだ相手と、選んだときの一覧の URL */
interface EnemySelection {
  listUrl: string;
  enemy: ChampionStatRow;
}

export default function CounterPickPage() {
  // レーン・ランク帯・リージョンは覚えておき、先出しピックと共有する（01 FR-08）。パッチは覚えない（FR-03）
  const { lane, region, tier, setLane, setRegion, setTier, isReady } =
    useSavedFilters({ lane: 'TOP', region: 'JP', tier: 'platinum_plus' });
  const patchList = useApiList<string>('/api/patches');
  const patches = patchList.rows;
  // 利用者が選ぶまでは、一覧の先頭（最新）を選ぶ
  const [selectedPatch, setSelectedPatch] = useState<string | null>(null);
  const patch = selectedPatch ?? patches[0] ?? '';
  const [search, setSearch] = useState('');

  // 保存値を読み終える前に、既定値で取りにいかない（03 の 5.4）
  const listUrl = isReady && patch
    ? `/api/champions?lane=${lane}&patch=${patch}&region=${region}&tier=${tier}&limit=100&min_games=50`
    : null;
  const championList = useApiList<ChampionStatRow>(listUrl);
  const allChamps = championList.rows;
  const isPatchEmpty = !patchList.isLoading && !patchList.hasError && patches.length === 0;
  const isListLoading = patchList.isLoading || (patch !== '' && (!isReady || championList.isLoading));

  // 絞り込み条件を変えると一覧が変わるので、相手の選択は外れる。選んだときの一覧の URL と比べて決める（effect の中で選択を消さないため）
  const [selection, setSelection] = useState<EnemySelection | null>(null);
  const selectedEnemy = selection !== null && selection.listUrl === listUrl ? selection.enemy : null;

  const counterList = useApiList<CounterStatRow>(
    selectedEnemy && patch
      ? `/api/counter?enemy_champion_id=${selectedEnemy.champions.champion_id}&lane=${lane}&patch=${patch}&region=${region}&tier=${tier}`
      : null
  );
  const counters = counterList.rows;

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
  const handleEnemyClick = (enemy: ChampionStatRow): void => {
    if (listUrl !== null) setSelection({ listUrl, enemy });
  };

  const filtered = allChamps.filter(c =>
    c.champions.champion_name.includes(search) ||
    c.champions.champion_key.toLowerCase().includes(search.toLowerCase())
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

      {/* ① レーン選択 */}
      <div className="px-5 py-3" style={{ background: '#0f1624', borderBottom: '1px solid #1f2937' }}>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>① 自分のレーンを選択</p>
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

      <div className="flex flex-1 overflow-hidden">
        {/* ② 相手チャンピオン選択 */}
        <div className="w-48 flex-shrink-0 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid #1f2937' }}>
          <p className="text-xs uppercase tracking-widest px-3 pt-3 pb-1" style={{ color: '#6b7280' }}>
            ② 相手チャンピオン
          </p>
          <div className="px-3 pb-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 検索..."
              className="w-full text-xs rounded px-2.5 py-1.5 outline-none"
              style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af' }} />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {patchList.hasError ? (
              <p role="alert" className="text-xs text-center py-4" style={{ color: '#f87171' }}>{PATCHES_ERROR_MESSAGE}</p>
            ) : isPatchEmpty ? (
              <p className="text-xs text-center py-4" style={{ color: '#6b7280' }}>{PATCHES_EMPTY_MESSAGE}</p>
            ) : championList.hasError ? (
              <p role="alert" className="text-xs text-center py-4" style={{ color: '#f87171' }}>{DATA_ERROR_MESSAGE}</p>
            ) : isListLoading ? (
              <p className="text-xs text-center py-4" style={{ color: '#6b7280' }}>読み込み中...</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {filtered.map(c => (
                  <button key={c.champions.champion_id}
                    onClick={() => handleEnemyClick(c)}
                    title={c.champions.champion_name}
                    className="w-8 h-8 rounded overflow-hidden transition-all"
                    style={{
                      border: selectedEnemy?.champions.champion_id === c.champions.champion_id
                        ? '2px solid #9b59b6' : '1px solid #374151',
                      background: selectedEnemy?.champions.champion_id === c.champions.champion_id
                        ? 'rgba(155,89,182,0.15)' : '#1f2937',
                    }}>
                    <Image src={c.champions.image_url} alt={c.champions.champion_name}
                      width={32} height={32} className="w-full h-full object-cover" unoptimized />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ③ カウンター結果 */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedEnemy ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: '#6b7280' }}>← 相手チャンピオンを選択してください</p>
            </div>
          ) : (
            <>
              {/* 選択済み相手カード */}
              <div className="flex items-center gap-3 rounded-lg px-4 py-3 mb-4"
                style={{ background: '#1c1a1f', border: '1px solid #7c3aed' }}>
                <div className="w-10 h-10 rounded-lg overflow-hidden border-2 flex-shrink-0"
                  style={{ borderColor: '#7c3aed' }}>
                  <Image src={selectedEnemy.champions.image_url} alt={selectedEnemy.champions.champion_name}
                    width={40} height={40} className="w-full h-full object-cover" unoptimized />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{selectedEnemy.champions.champion_name}（{lane}）</p>
                  <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                    勝率 {formatWinRate(selectedEnemy.win_rate)} ｜ {formatGames(selectedEnemy.games_played)} 試合
                  </p>
                </div>
              </div>

              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>
                ③ カウンターチャンピオン
              </p>

              {counterList.hasError ? (
                <p role="alert" className="text-sm text-center py-6" style={{ color: '#f87171' }}>{DATA_ERROR_MESSAGE}</p>
              ) : counterList.isLoading ? (
                <p className="text-sm text-center py-6" style={{ color: '#6b7280' }}>読み込み中...</p>
              ) : counters.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: '#6b7280' }}>データが不足しています（試合数200未満）</p>
              ) : (
                counters.map((row, i) => (
                  <div key={row.champions.champion_id}
                    className="flex items-center gap-3 rounded px-3 py-2 mb-1"
                    style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <span className="text-xs w-5 text-center" style={{ color: '#4b5563' }}>{i + 1}</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0"
                      style={{ borderColor: '#374151' }}>
                      <Image src={row.champions.image_url} alt={row.champions.champion_name}
                        width={32} height={32} className="w-full h-full object-cover" unoptimized />
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
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
