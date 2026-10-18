'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AppHeader from '@/components/AppHeader';
import { LANES, REGIONS, TIERS, getTierLabel, getWinRateColor, formatWinRate, formatGames } from '@/lib/types';
import type { Lane, Region, Tier, ChampionStatRow, Tier_Label } from '@/lib/types';

const TIER_COLORS: Record<Tier_Label, string> = {
  S: '#ffd700', A: '#ff6b35', B: '#4169e1', C: '#6b7280',
};

export default function FirstPickPage() {
  const [lane, setLane]       = useState<Lane>('MID');
  const [region, setRegion]   = useState<Region>('JP');
  const [tier, setTier]       = useState<Tier>('platinum_plus');
  const [patch, setPatch]     = useState<string>('');
  const [patches, setPatches] = useState<string[]>([]);
  const [data, setData]       = useState<ChampionStatRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/patches').then(r => r.json()).then((ps: string[]) => {
      setPatches(ps);
      if (ps.length > 0) setPatch(ps[0]);
    });
  }, []);

  useEffect(() => {
    if (!patch) return;
    setLoading(true);
    fetch(`/api/champions?lane=${lane}&patch=${patch}&region=${region}&tier=${tier}`)
      .then(r => r.json())
      .then((rows: ChampionStatRow[]) => { setData(rows); setLoading(false); });
  }, [lane, patch, region, tier]);

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
        {loading ? (
          <p className="text-center py-10 text-sm" style={{ color: '#6b7280' }}>読み込み中...</p>
        ) : data.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: '#6b7280' }}>データがありません</p>
        ) : (
          (['S', 'A', 'B', 'C'] as Tier_Label[]).map(t => grouped[t].length > 0 && (
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
                const rankNum = grouped['S'].indexOf(row) + grouped['A'].indexOf(row) + grouped['B'].indexOf(row) + grouped['C'].indexOf(row) +
                  (['S', 'A', 'B', 'C'] as Tier_Label[]).slice(0, ['S', 'A', 'B', 'C'].indexOf(t)).reduce((s, tt) => s + grouped[tt].length, 0) + i + 1;
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
