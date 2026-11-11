import { NextRequest } from 'next/server';
import { LANES, REGIONS, TIERS, DEFAULT_MIN_GAMES, type Lane, type Region, type Tier } from '@/lib/constants';
import { okResponse, badRequest, isValidPatch, parseIntParam } from '@/lib/api';
import { MOCK_CHAMPION_STATS } from '@/lib/mock-data';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// 仕様: docs/05_api-design.html 3章
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lane   = searchParams.get('lane') as Lane;
  const patch  = searchParams.get('patch');
  const region = (searchParams.get('region') ?? 'JP') as Region;
  const tier   = (searchParams.get('tier') ?? 'platinum_plus') as Tier;

  if (!lane || !LANES.includes(lane)) return badRequest('Invalid lane');
  if (!isValidPatch(patch))           return badRequest('Invalid patch');
  if (!REGIONS.includes(region))      return badRequest('Invalid region');
  if (!TIERS.includes(tier))          return badRequest('Invalid tier');

  const limit    = parseIntParam(searchParams.get('limit'), DEFAULT_LIMIT, 1);
  const minGames = parseIntParam(searchParams.get('min_games'), DEFAULT_MIN_GAMES.champions[tier], 0);
  if (limit === null)    return badRequest('Invalid limit');
  if (minGames === null) return badRequest('Invalid min_games');

  // TODO: Supabase接続後はモックデータをSupabaseクエリに差し替え（patch・region・tier での絞り込みもそのとき行う）
  const data = (MOCK_CHAMPION_STATS[lane] ?? [])
    .filter(r => r.games_played >= minGames)
    .slice(0, Math.min(limit, MAX_LIMIT));

  return okResponse(data);
}
