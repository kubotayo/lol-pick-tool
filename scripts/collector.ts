// スノーボールで試合を集めて集計するメインループ
// Riot API と終了条件は引数で受け取る（テストで偽物に差し替えられるようにするため）
import { createAggregationResult, aggregateMatch, type AggregationResult } from './aggregator';
import { normalizePatch, type StopReason } from './utils';
import { averageMatchPoints, rankTiersForPoints, pickNextTier, type CollectTier } from './rank';
import type { Roster } from './roster';
import type { MatchDto } from './types';

export interface MatchSource {
  getMatchIds(puuid: string, count: number): Promise<string[]>;
  getMatch(matchId: string): Promise<MatchDto>;
}

export interface CollectOptions {
  patch:            string;
  region:           string;
  targetTiers:      readonly CollectTier[];
  roster:           Roster;
  seedPools:        Record<CollectTier, string[]>; // ランクごとのシード候補（シャッフル済み。末尾から使う）
  processedIds:     ReadonlySet<string>;          // 前回までに処理済みの試合ID
  seedsPerTier:     number;                       // キューが空のランクに一度に補充する人数
  matchesPerPlayer: number;                       // 1人から取る直近の試合数
  shouldStop:       (totalMatches: number) => StopReason | null;
  onProgress?:      (totalMatches: number, collected: Record<CollectTier, number>) => void;
}

export interface CollectResult {
  aggregation:    AggregationResult;
  matchIds:       string[];                      // 今回新しく集計した試合ID
  stopReason:     StopReason | 'queue_empty';
  collected:      Record<CollectTier, number>;   // 収集元のランクごとの試合数
  rankTierCounts: Record<string, number>;        // ランク帯ごとの加算試合数
}

// ランクごとの収集状態
interface TierState {
  players:   string[]; // 試合IDを取りに行くプレイヤー（puuid）
  matches:   string[]; // 処理待ちの試合ID（キューが空のときだけ1人分を入れるので、常に今のプレイヤーの試合だけ）
  seedPool:  string[];
  collected: number;
}

export async function collectMatches(source: MatchSource, options: CollectOptions): Promise<CollectResult> {
  const { patch, region, targetTiers, roster, processedIds } = options;

  const state = {} as Record<CollectTier, TierState>;
  for (const tier of targetTiers) {
    state[tier] = { players: [], matches: [], seedPool: [...options.seedPools[tier]], collected: 0 };
  }
  const seenPuuids = new Set<string>();
  // 一度でもキューに入れた試合ID。同じ試合に出た複数プレイヤーから同じIDが返るため、二重集計を防ぐ
  const queuedMatchIds = new Set<string>();
  const aggregation = createAggregationResult();
  const matchIds: string[] = [];
  const rankTierCounts: Record<string, number> = {};
  const collected = (): Record<CollectTier, number> => {
    const result = { PLATINUM: 0, EMERALD: 0, DIAMOND: 0, MASTER: 0 };
    for (const t of targetTiers) result[t] = state[t].collected;
    return result;
  };

  // キューが空になったランクに、名簿からまだ使っていないプレイヤーを補充する
  const refill = (tier: CollectTier): void => {
    const s = state[tier];
    if (s.players.length > 0 || s.matches.length > 0) return;
    while (s.players.length < options.seedsPerTier && s.seedPool.length > 0) {
      const puuid = s.seedPool.pop()!;
      if (seenPuuids.has(puuid)) continue;
      seenPuuids.add(puuid);
      s.players.push(puuid);
    }
  };
  const hasWork = (tier: CollectTier): boolean => {
    refill(tier);
    return state[tier].players.length > 0 || state[tier].matches.length > 0;
  };

  // 集めた試合数が最も少ないランクから順に進め、収集対象ランクの試合数をそろえる
  let stopReason: StopReason | 'queue_empty' = 'queue_empty';
  while (true) {
    const reason = options.shouldStop(matchIds.length);
    if (reason) {
      stopReason = reason;
      break;
    }

    const tier = pickNextTier(targetTiers, collected(), hasWork);
    if (tier === null) break; // 名簿のプレイヤーも使い切った
    const s = state[tier];

    // 処理待ちの試合がなければ、プレイヤーの直近の試合IDを取りに行く
    if (s.matches.length === 0) {
      const puuid = s.players.shift()!;
      try {
        const ids = await source.getMatchIds(puuid, options.matchesPerPlayer);
        for (const id of ids) {
          if (!processedIds.has(id) && !queuedMatchIds.has(id)) {
            queuedMatchIds.add(id);
            s.matches.push(id);
          }
        }
      } catch (err) {
        console.warn(`[collect] 試合ID取得失敗 PUUID=${puuid.slice(0, 8)}...:`, err);
      }
      continue;
    }

    const matchId = s.matches.shift()!;
    try {
      const match = await source.getMatch(matchId);

      // 対象パッチ以外はスキップ
      // 試合IDは新しい順なので、古いパッチの試合が出たらこのプレイヤーの残りも古い。残りは取りに行かない
      // （休止中のプレイヤーで20試合分のリクエストを無駄にし、そのランクが選ばれ続けるのを防ぐ）
      if (normalizePatch(match.info.gameVersion) !== patch) {
        s.matches.length = 0;
        continue;
      }

      const participants = match.info.participants;

      // リメイク（開始直後の降参）の試合は集計しない。数分で終わった試合はチャンピオンの強さと関係がなく、勝率を歪めるため
      // 処理済みにも記録せず、参加者を次のシードにも使わない。同じプレイヤーの残りの試合は通常どおり続ける
      if (participants.some(p => p.gameEndedInEarlySurrender)) continue;

      // 10人の平均ランクで、この試合を加算するランク帯を決める（名簿にいない人は Gold 相当）
      const average = averageMatchPoints(participants.map(p => roster.get(p.puuid)?.points ?? null));
      const rankTiers = rankTiersForPoints(average);

      aggregateMatch(match, patch, region, rankTiers, aggregation);
      matchIds.push(matchId);
      s.collected++;
      for (const t of rankTiers) rankTierCounts[t] = (rankTierCounts[t] ?? 0) + 1;

      // 参加者のうち、名簿にいて収集対象ランクの人を、そのランクのキューに追加する（スノーボール拡張）
      for (const p of participants) {
        const entry = roster.get(p.puuid);
        if (!entry || !state[entry.tier] || seenPuuids.has(p.puuid)) continue;
        seenPuuids.add(p.puuid);
        state[entry.tier].players.push(p.puuid);
      }

      options.onProgress?.(matchIds.length, collected());
    } catch (err) {
      console.warn(`[collect] 試合詳細取得失敗 ${matchId}:`, err);
    }
  }

  return { aggregation, matchIds, stopReason, collected: collected(), rankTierCounts };
}
