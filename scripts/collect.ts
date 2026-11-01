import { RiotClient } from './riotClient';
import { createAggregationResult, aggregateMatch, AggregationResult } from './aggregator';
import { applyBatchResult, getProcessedMatchIds } from './supabaseWriter';
import { supabase } from './supabase';
import { normalizePatch, parseTargetRegion, parsePositiveInt, getStopReason, StopReason } from './utils';

// 時間上限の起点（プロセス開始時点）
const PROCESS_STARTED_AT = Date.now();

const RANK_TIER   = process.env.TARGET_TIER       ?? 'DIAMOND';

// 時間上限のデフォルト: GitHub Actions の timeout-minutes: 360 から、書き込み用に30分の余裕を見る
const DEFAULT_MAX_DURATION_MINUTES = 330;

// スノーボールのシードに使うプレイヤー数（多すぎるとAPIレートを無駄遣いするため絞る）
const SEED_PLAYERS  = 15;
// 1プレイヤーあたりの試合取得数
const MATCHES_PER_PLAYER = 20;

const STOP_REASON_LABEL: Record<StopReason | 'queue_empty', string> = {
  time_limit:  '時間上限に達した',
  match_limit: '試合数上限に達した',
  queue_empty: 'キューが空になった',
};

// 環境変数を読み込む（不正な値ならエラーで止める）
function loadConfig() {
  return {
    platform:      parseTargetRegion(process.env.TARGET_REGIONS),
    maxDurationMs: (parsePositiveInt('MAX_DURATION_MINUTES', process.env.MAX_DURATION_MINUTES, DEFAULT_MAX_DURATION_MINUTES) ?? DEFAULT_MAX_DURATION_MINUTES) * 60_000,
    maxMatches:    parsePositiveInt('MAX_MATCHES', process.env.MAX_MATCHES, null),
  };
}

// collection_logs に開始行を追加し、採番された id を返す（失敗してもバッチは継続し、null を返す）
async function startLog(data: Record<string, unknown>): Promise<number | null> {
  try {
    const { data: row, error } = await supabase.from('collection_logs').insert(data).select('id').single();
    if (error) throw error;
    return row.id as number;
  } catch (err) {
    console.error('[log] 開始ログの記録に失敗（処理は継続）:', err);
    return null;
  }
}

// collection_logs の開始行を更新する（失敗してもバッチは継続）
async function updateLog(id: number | null, data: Record<string, unknown>): Promise<void> {
  if (id === null) return;
  try {
    const { error } = await supabase.from('collection_logs').update(data).eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('[log] ログの更新に失敗（処理は継続）:', err);
  }
}

// Data Dragon から最新チャンピオン一覧を取得して champions テーブルを同期する（FR-24）
async function syncChampions(patch: string): Promise<void> {
  console.log('[sync] champions テーブルを同期中...');

  // ddragon のバージョン形式は "14.21.1" なので versions.json から取得したフル値を使う
  const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions: string[] = await versionsRes.json();
  const ddVersion = versions[0];

  const champRes  = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/ja_JP/champion.json`);
  const champData = await champRes.json() as { data: Record<string, { key: string; name: string }> };

  const rows = Object.entries(champData.data).map(([key, champ]) => ({
    champion_id:   Number(champ.key),
    champion_key:  key,
    champion_name: champ.name,
    image_url:     `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${key}.png`,
    updated_at:    new Date().toISOString(),
  }));

  // 500件単位でバッチUPSERT
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('champions')
      .upsert(rows.slice(i, i + 500), { onConflict: 'champion_id' });
    if (error) throw new Error(`[champions] 同期失敗: ${error.message}`);
  }

  console.log(`[sync] champions 同期完了: ${rows.length}件`);
}

// 最新パッチバージョンを Data Dragon から取得する
async function fetchLatestPatch(): Promise<string> {
  const res     = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions: string[] = await res.json();
  return normalizePatch(versions[0]);
}

// スノーボール方式でメイン収集処理を実行する
async function runCollection(): Promise<void> {
  const { platform, maxDurationMs, maxMatches } = loadConfig();
  const client = new RiotClient(platform);
  const region  = platform.replace(/[0-9]/g, '').toUpperCase(); // "jp1" → "JP"
  console.log(`[collect] 終了条件: 時間上限 ${maxDurationMs / 60_000}分 / 試合数上限 ${maxMatches ?? 'なし'}`);

  // ① APIキー事前検証（失効していれば即座に失敗させる）
  await client.validateApiKey();

  // ② 最新パッチ取得 + champions 同期
  const patch = await fetchLatestPatch();
  console.log(`[collect] 対象パッチ: ${patch} / リージョン: ${region} / ランク帯: ${RANK_TIER}`);
  await syncChampions(patch);

  // ③ collection_logs にジョブ開始を記録
  const logId = await startLog({ patch, region, rank_tier: RANK_TIER, status: 'running', started_at: new Date().toISOString() });

  let totalMatches = 0;

  try {
    // ④ シードプレイヤーを LEAGUE-V4 から取得（Challenger → Grandmaster → Diamond I の順）
    console.log(`[collect] シードプレイヤーを取得中...`);
    const seedPuuids: string[] = [];
    const seedTiers = [
      { tier: 'CHALLENGER',   division: 'I' },
      { tier: 'GRANDMASTER',  division: 'I' },
      { tier: RANK_TIER,      division: 'I' },
    ];

    for (const { tier, division } of seedTiers) {
      if (seedPuuids.length >= SEED_PLAYERS) break;
      try {
        const entries = await client.getLeagueEntries('RANKED_SOLO_5x5', tier, division, 1);
        for (const entry of entries) {
          if (seedPuuids.length >= SEED_PLAYERS) break;
          if (entry.puuid) seedPuuids.push(entry.puuid);
        }
      } catch (err) {
        console.warn(`[collect] ${tier} シード取得失敗（スキップ）:`, err);
      }
    }

    console.log(`[collect] シードプレイヤー ${seedPuuids.length}人 取得完了`);

    // ⑤ 処理済み試合IDをDBから取得してスノーボールの重複除去に使用
    const processedIds = await getProcessedMatchIds(patch);
    console.log(`[collect] 既処理済み試合: ${processedIds.size}件`);

    // スノーボール用のキュー（処理待ち試合ID）とPUUIDキュー
    const matchQueue:  string[] = [];
    const puuidQueue:  string[] = [...seedPuuids];
    const seenPuuids   = new Set<string>(seedPuuids);
    const aggregation: AggregationResult = createAggregationResult();
    const newlyProcessed: string[] = [];
    // 一度でもキューに入れた試合ID。同じ試合に出た複数プレイヤーから同じIDが返るため、二重集計を防ぐ
    const queuedMatchIds = new Set<string>();

    // ⑥ スノーボールメインループ（BFS方式）
    // スノーボールではキューがほぼ空にならないため、時間上限・試合数上限のうち先に達した方で止める
    let stopReason: StopReason | 'queue_empty' = 'queue_empty';
    while (puuidQueue.length > 0 || matchQueue.length > 0) {
      const reason = getStopReason({
        elapsedMs: Date.now() - PROCESS_STARTED_AT,
        maxDurationMs,
        totalMatches,
        maxMatches,
      });
      if (reason) {
        stopReason = reason;
        break;
      }

      // PUUIDキューから試合IDを取得してmatchQueueに追加
      if (puuidQueue.length > 0) {
        const puuid = puuidQueue.shift()!;
        try {
          const matchIds = await client.getMatchIds(puuid, MATCHES_PER_PLAYER);
          for (const id of matchIds) {
            if (!processedIds.has(id) && !queuedMatchIds.has(id)) {
              queuedMatchIds.add(id);
              matchQueue.push(id);
            }
          }
        } catch (err) {
          console.warn(`[collect] 試合ID取得失敗 PUUID=${puuid.slice(0, 8)}...:`, err);
        }
      }

      // matchQueueから試合を処理
      if (matchQueue.length > 0) {
        const matchId = matchQueue.shift()!;
        try {
          const match = await client.getMatch(matchId);

          // 対象パッチ以外はスキップ
          const matchPatch = normalizePatch(match.info.gameVersion);
          if (matchPatch !== patch) continue;

          // 集計処理
          aggregateMatch(match, patch, region, RANK_TIER, aggregation);
          newlyProcessed.push(matchId);
          totalMatches++;

          // 参加者10人のPUUIDを未訪問であればキューに追加（スノーボール拡張）
          for (const p of match.info.participants) {
            if (!seenPuuids.has(p.puuid)) {
              seenPuuids.add(p.puuid);
              puuidQueue.push(p.puuid);
            }
          }

          if (totalMatches % 100 === 0) {
            console.log(`[collect] 処理済み試合: ${totalMatches}件 / キュー残: ${matchQueue.length}件`);
          }
        } catch (err) {
          console.warn(`[collect] 試合詳細取得失敗 ${matchId}:`, err);
        }
      }
    }

    console.log(`[collect] ループ終了: ${STOP_REASON_LABEL[stopReason]}（処理済み ${totalMatches}試合 / 経過 ${Math.round((Date.now() - PROCESS_STARTED_AT) / 60_000)}分）`);

    // ⑦ 集計結果の加算と処理済み試合IDの記録を、1トランザクションで書き込む
    if (newlyProcessed.length > 0) {
      console.log(`[collect] DBに書き込み中... (${totalMatches}試合分)`);
      const counts = await applyBatchResult(aggregation, newlyProcessed, patch, region, RANK_TIER);
      console.log(`[collect] champion_stats: ${counts.championRows}件 / counter_stats: ${counts.counterRows}件 / item_build_stats: ${counts.itemRows}件 を加算`);
    } else {
      console.log('[collect] 新しく処理した試合がないため、書き込みをスキップ');
    }

    // ⑧ ログ完了記録
    await updateLog(logId, {
      status:            'completed',
      matches_collected: totalMatches,
      completed_at:      new Date().toISOString(),
    });

    console.log(`[collect] 完了: ${totalMatches}試合を処理しました`);

  } catch (err) {
    // 致命的エラーをログに記録してプロセスを失敗終了させる
    const message = err instanceof Error ? err.message : String(err);
    console.error('[collect] 致命的なエラー:', message);
    await updateLog(logId, {
      status:        'failed',
      error_message: message,
      completed_at:  new Date().toISOString(),
    });
    throw err;
  }
}

// エントリーポイント
async function main(): Promise<void> {
  try {
    await runCollection();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

main();
