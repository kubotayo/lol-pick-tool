import { NextRequest, NextResponse } from 'next/server';
import { LANES, REGIONS, TIERS, type Lane, type Region, type Tier } from '@/lib/constants';
import { MOCK_COUNTER_STATS, getMockCounterKey } from '@/lib/mock-data';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const enemyId   = Number(searchParams.get('enemy_champion_id'));
  const lane      = searchParams.get('lane') as Lane;
  const region    = (searchParams.get('region') ?? 'JP') as Region;
  const tier      = (searchParams.get('tier') ?? 'platinum_plus') as Tier;
  const limit     = Math.min(Number(searchParams.get('limit') ?? 15), 100);
  const minGames  = Number(searchParams.get('min_games') ?? 200);

  if (!enemyId || isNaN(enemyId))         return NextResponse.json({ error: 'Invalid enemy_champion_id' }, { status: 400 });
  if (!lane || !LANES.includes(lane))     return NextResponse.json({ error: 'Invalid lane' },               { status: 400 });
  if (!REGIONS.includes(region))          return NextResponse.json({ error: 'Invalid region' },             { status: 400 });
  if (!TIERS.includes(tier))              return NextResponse.json({ error: 'Invalid tier' },               { status: 400 });

  // TODO: Supabase接続後はモックデータをSupabaseクエリに差し替え
  const key  = getMockCounterKey(enemyId, lane);
  const data = (MOCK_COUNTER_STATS[key] ?? [])
    .filter(r => r.games_played >= minGames)
    .slice(0, limit);

  return NextResponse.json(data);
}
