// 名簿: Platinum 以上の全プレイヤーのランク（puuid → ランク）
// 試合に出た10人の平均ランクを出すために、バッチの最初に1回だけ作る（JP で約600リクエスト・約14分）
import type { RiotClient } from './riotClient';
import { rankToPoints, pointsToCollectTier, type CollectTier } from './rank';

const QUEUE = 'RANKED_SOLO_5x5';
const DIVISIONS = ['I', 'II', 'III', 'IV'] as const;
const ENTRY_TIERS = ['DIAMOND', 'EMERALD', 'PLATINUM'] as const;
const APEX_TIERS = ['challenger', 'grandmaster', 'master'] as const;

export interface RosterEntry {
  points: number;
  tier:   CollectTier;
}

export type Roster = Map<string, RosterEntry>;

function addEntry(roster: Roster, puuid: string | undefined, tier: string, division: string, leaguePoints: number): void {
  if (!puuid) return;
  const points = rankToPoints(tier, division, leaguePoints);
  if (points === null) return;
  const collectTier = pointsToCollectTier(points);
  if (collectTier === null) return;
  roster.set(puuid, { points, tier: collectTier });
}

/**
 * 名簿を作る
 * 一部のページの取得に失敗しても続ける（その人たちは名簿にいない = Gold 相当として扱われる）
 */
export async function buildRoster(client: RiotClient): Promise<Roster> {
  const roster: Roster = new Map();
  let failedRequests = 0;

  for (const apex of APEX_TIERS) {
    try {
      const league = await client.getApexLeague(QUEUE, apex);
      for (const e of league.entries) addEntry(roster, e.puuid, league.tier, e.rank, e.leaguePoints);
    } catch (err) {
      failedRequests++;
      console.warn(`[roster] ${apex} の取得に失敗（スキップ）:`, err);
    }
  }

  for (const tier of ENTRY_TIERS) {
    for (const division of DIVISIONS) {
      for (let page = 1; ; page++) {
        try {
          const entries = await client.getLeagueEntries(QUEUE, tier, division, page);
          if (entries.length === 0) break;
          for (const e of entries) addEntry(roster, e.puuid, e.tier, e.rank, e.leaguePoints);
        } catch (err) {
          // 1ページの失敗で以降のページを諦めると、その段階の大半が名簿から抜けるため、次のページへ進む
          failedRequests++;
          console.warn(`[roster] ${tier} ${division} ${page}ページの取得に失敗（スキップ）:`, err);
          if (failedRequests > 20) throw new Error('[roster] 名簿の取得失敗が20回を超えたため中止します');
        }
      }
    }
    console.log(`[roster] ${tier} まで取得: 累計 ${roster.size}人`);
  }

  console.log(`[roster] 名簿の作成完了: ${roster.size}人（取得失敗 ${failedRequests}回）`);
  return roster;
}

/** 名簿をランクごとに分け、シャッフルした puuid の配列にする（シードの補充に使う） */
export function groupRosterByTier(roster: Roster): Record<CollectTier, string[]> {
  const groups: Record<CollectTier, string[]> = { PLATINUM: [], EMERALD: [], DIAMOND: [], MASTER: [] };
  for (const [puuid, entry] of roster) groups[entry.tier].push(puuid);
  for (const list of Object.values(groups)) shuffle(list);
  return groups;
}

// Fisher–Yates シャッフル
function shuffle<T>(list: T[]): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}
