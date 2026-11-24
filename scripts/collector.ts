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
  // 集めた試合を途中で書き込む（writeEvery 試合ごとと、最後の残り）。書き込んだ分の集計はメモリから消す
  // 1回の書き込みを小さくして DB の時間の上限に収め、途中で止まってもそこまでの試合を残すため（02 ステップ6）
  // 書き込みが失敗したら collectMatches も失敗する（そこで止める）
  writeEvery?:      number;
  onWrite?:         (aggregation: AggregationResult, matchIds: string[]) => Promise<void>;
}

export interface CollectResult {
  aggregation:    AggregationResult;             // まだ書き込んでいない分の集計（onWrite を渡したときは空）
  matchIds:       string[];                      // 今回新しく集計した試合ID（書き込んだ分を含むすべて）
  stopReason:     StopReason | 'queue_empty';
  collected:      Record<CollectTier, number>;   // 収集元のランクごとの試合数
  rankTierCounts: Record<string, number>;        // ランク帯ごとの加算試合数
  requestStats:   RequestStats;                  // メインループの Riot API の呼び出しの内訳
}

// メインループの Riot API の呼び出しの内訳。どこにリクエストを使ったかをログで確かめるため
// 名簿の作成と 429 の再試行は含まない
export interface RequestStats {
  matchIdCalls:     number; // 試合ID一覧の取得
  matchIdFailures:  number; // うち失敗
  playersNoNew:     number; // うち、新しい試合が1つもなかったプレイヤー
  matchCalls:       number; // 試合詳細の取得
  otherPatchStops:  number; // うち、対象パッチ以外（古い・新しいの両方）の試合で打ち切った
  earlySurrenders:  number; // うち、リメイクで集計しなかった
  invalidResults:   number; // うち、勝者が1チームでなく集計しなかった
  matchFailures:    number; // うち、取得または処理の失敗
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
  let aggregation = createAggregationResult();
  const matchIds: string[] = [];
  let pendingIds: string[] = []; // まだ書き込んでいない試合ID（aggregation に入っている分）
  const write = async (): Promise<void> => {
    if (!options.onWrite || pendingIds.length === 0) return;
    await options.onWrite(aggregation, pendingIds);
    aggregation = createAggregationResult();
    pendingIds = [];
  };
  const rankTierCounts: Record<string, number> = {};
  const requestStats: RequestStats = {
    matchIdCalls: 0, matchIdFailures: 0, playersNoNew: 0,
    matchCalls: 0, otherPatchStops: 0, earlySurrenders: 0, invalidResults: 0, matchFailures: 0,
  };
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
      requestStats.matchIdCalls++;
      try {
        const ids = await source.getMatchIds(puuid, options.matchesPerPlayer);
        for (const id of ids) {
          if (!processedIds.has(id) && !queuedMatchIds.has(id)) {
            queuedMatchIds.add(id);
            s.matches.push(id);
          }
        }
        if (s.matches.length === 0) requestStats.playersNoNew++;
      } catch (err) {
        requestStats.matchIdFailures++;
        console.warn(`[collect] 試合ID取得失敗 PUUID=${puuid.slice(0, 8)}...:`, err);
      }
      continue;
    }

    const matchId = s.matches.shift()!;
    requestStats.matchCalls++;
    try {
      const match = await source.getMatch(matchId);

      // 対象パッチ以外はスキップ
      // 試合IDは新しい順なので、古いパッチの試合が出たらこのプレイヤーの残りも古い。残りは取りに行かない
      // 対象より新しいパッチの試合でも同じく打ち切る（この場合は、残りに対象パッチの試合があっても取らない）
      // （休止中のプレイヤーで20試合分のリクエストを無駄にし、そのランクが選ばれ続けるのを防ぐ）
      if (normalizePatch(match.info.gameVersion) !== patch) {
        requestStats.otherPatchStops++;
        s.matches.length = 0;
        continue;
      }

      const participants = match.info.participants;

      // リメイク（開始直後の降参）の試合は集計しない。数分で終わった試合はチャンピオンの強さと関係がなく、勝率を歪めるため
      // 処理済みにも記録せず、参加者を次のシードにも使わない。同じプレイヤーの残りの試合は通常どおり続ける
      if (participants.some(p => p.gameEndedInEarlySurrender)) {
        requestStats.earlySurrenders++;
        continue;
      }

      // 勝者が1チーム（勝った参加者がちょうど5人で、同じチーム）でない試合も集計しない（リメイクと同じ扱い）
      // 不正対策による中止（endOfGameResult: Abort_AntiCheatExit）などで両チームとも負けの試合があり、
      // 集計すると試合数だけが増えて勝率が下がるため（システムテスト ST-10 で 1,100試合中1試合）
      if (!hasSingleWinningTeam(participants)) {
        requestStats.invalidResults++;
        continue;
      }

      // 10人の平均ランクで、この試合を加算するランク帯を決める（名簿にいない人は Gold 相当）
      const average = averageMatchPoints(participants.map(p => roster.get(p.puuid)?.points ?? null));
      const rankTiers = rankTiersForPoints(average);

      aggregateMatch(match, patch, region, rankTiers, aggregation);
      matchIds.push(matchId);
      pendingIds.push(matchId);
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
      requestStats.matchFailures++;
      console.warn(`[collect] 試合詳細取得失敗 ${matchId}:`, err);
    }

    // 書き込みは試合の取得のエラー処理の外で行う（書き込みの失敗を「取得失敗」として飛ばさないため）
    if (options.writeEvery !== undefined && pendingIds.length >= options.writeEvery) await write();
  }

  await write();
  return { aggregation, matchIds, stopReason, collected: collected(), rankTierCounts, requestStats };
}

/** リクエストの内訳をログの1行にする。集計した試合が0件なら「1試合あたり」は - にする */
export function formatRequestStats(stats: RequestStats, totalMatches: number): string {
  const perMatch = totalMatches > 0 ? ((stats.matchIdCalls + stats.matchCalls) / totalMatches).toFixed(2) : '-';
  return `試合ID一覧 ${stats.matchIdCalls}回（失敗 ${stats.matchIdFailures} / 新しい試合なし ${stats.playersNoNew}）`
    + ` / 試合詳細 ${stats.matchCalls}回（集計 ${totalMatches} / 対象外パッチで打ち切り ${stats.otherPatchStops}`
    + ` / リメイク ${stats.earlySurrenders} / 勝者が1チームでない ${stats.invalidResults} / 失敗 ${stats.matchFailures}）`
    + ` / 1試合あたり ${perMatch}回`;
}

/** 勝った参加者がちょうど5人で、全員が同じチームなら true */
export function hasSingleWinningTeam(participants: MatchDto['info']['participants']): boolean {
  const winners = participants.filter(p => p.win);
  return winners.length === 5 && winners.every(p => p.teamId === winners[0].teamId);
}
