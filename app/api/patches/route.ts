import { NextResponse } from 'next/server';
import { MOCK_PATCHES } from '@/lib/mock-data';

export async function GET() {
  // TODO: Supabase接続後は SELECT DISTINCT patch FROM champion_stats ORDER BY patch DESC に差し替え
  return NextResponse.json(MOCK_PATCHES);
}
