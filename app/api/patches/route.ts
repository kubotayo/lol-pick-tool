import { okResponse, sortPatchesDesc } from '@/lib/api';
import { MOCK_PATCHES } from '@/lib/mock-data';

// 仕様: docs/05_api-design.html 5章
export async function GET() {
  // TODO: Supabase接続後は、集計データがあるパッチを DB 側で重複除去して取得する（select は1回最大1000行のため）
  return okResponse(sortPatchesDesc(MOCK_PATCHES));
}
