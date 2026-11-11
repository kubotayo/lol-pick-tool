'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AppHeader from '@/components/AppHeader';
import { LANES, REGIONS, TIERS } from '@/lib/constants';
import { getWinRateColor, formatWinRate, formatGames } from '@/lib/utils';
import type { Lane, Region, Tier } from '@/lib/constants';
import type { ChampionStatRow, CounterStatRow } from '@/lib/types';

export default function CounterPickPage() {
  const [lane, setLane]               = useState<Lane>('TOP');
  const [region, setRegion]           = useState<Region>('JP');
  const [tier, setTier]               = useState<Tier>('platinum_plus');
  const [patch, setPatch]             = useState<string>('');
  const [patches, setPatches]         = useState<string[]>([]);
  const [search, setSearch]           = useState('');
  const [allChamps, setAllChamps]     = useState<ChampionStatRow[]>([]);
  const [selectedEnemy, setEnemy]     = useState<ChampionStatRow | null>(null);
  const [counters, setCounters]       = useState<CounterStatRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingCtr, setLoadingCtr]   = useState(false);

  useEffect(() => {
    fetch('/api/patches').then(r => r.json()).then((ps: string[]) => {
      setPatches(ps);
      if (ps.length > 0) setPatch(ps[0]);
    });
  }, []);

  useEffect(() => {
    if (!patch) return;
    setLoadingList(true);
    setEnemy(null);
    setCounters([]);
    fetch(`/api/champions?lane=${lane}&patch=${patch}&region=${region}&tier=${tier}&limit=100&min_games=50`)
      .then(r => r.json())
      .then((rows: ChampionStatRow[]) => { setAllChamps(rows); setLoadingList(false); });
  }, [lane, patch, region, tier]);

  useEffect(() => {
    if (!selectedEnemy || !patch) return;
    setLoadingCtr(true);
    fetch(`/api/counter?enemy_champion_id=${selectedEnemy.champions.champion_id}&lane=${lane}&patch=${patch}&region=${region}&tier=${tier}`)
      .then(r => r.json())
      .then((rows: CounterStatRow[]) => { setCounters(rows); setLoadingCtr(false); });
  }, [selectedEnemy, lane, patch, region, tier]);

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
        {[
          { label: 'リージョン', value: region, set: setRegion, opts: REGIONS },
          { label: 'ランク帯',   value: tier,   set: setTier,   opts: TIERS,
            labels: { all: '全体', platinum_plus: 'Platinum+', diamond_plus: 'Diamond+', master_plus: 'Master+' } },
        ].map(({ label, value, set, opts, labels }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: '#6b7280' }}>{label}</span>
            <select value={value} onChange={e => (set as (v: string) => void)(e.target.value)}
              className="text-xs rounded px-2 py-1"
              style={{ background: '#1f2937', border: '1px solid #374151', color: '#d1d5db' }}>
              {(opts as readonly string[]).map(o => (
                <option key={o} value={o}>{(labels as Record<string, string> | undefined)?.[o] ?? o}</option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: '#6b7280' }}>パッチ</span>
          <select value={patch} onChange={e => setPatch(e.target.value)}
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
            {loadingList ? (
              <p className="text-xs text-center py-4" style={{ color: '#6b7280' }}>読み込み中...</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {filtered.map(c => (
                  <button key={c.champions.champion_id}
                    onClick={() => setEnemy(c)}
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

              {loadingCtr ? (
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
