import { RiotClient } from './riotClient';
import { archiveOldPatches, createChunkWriter, getProcessedMatchIds, WRITE_ITEM_BUILDS } from './supabaseWriter';
import { supabase } from './supabase';
import { normalizePatch, parseTargetRegion, parsePositiveInt, getStopReason, StopReason } from './utils';
import { collectMatches } from './collector';
import { buildRoster, groupRosterByTier } from './roster';
import { parseTargetTiers, type CollectTier } from './rank';

// 時間上限の起点（プロセス開始時点）
const PROCESS_STARTED_AT = Date.now();

// 時間上限のデフォルト: GitHub Actions の timeout-minutes: 360 から、書き込み用に30分の余裕を見る
const DEFAULT_MAX_DURATION_MINUTES = 330;

// ランクごとに一度に入れるシードの人数（キューが空になったら名簿から同じ人数を補充する）
const SEED_PLAYERS_PER_TIER = 5;
// 1プレイヤーあたりの試合取得数
const MATCHES_PER_PLAYER = 20;
// この試合数ごとに DB に書き込む。1回の書き込みを API の時間の上限（8秒）に収めるため
// （1回の書き込みは 500試合で約2秒、6,000試合では約9秒かかった。2026-11-10 にローカルで計測）
const WRITE_EVERY_MATCHES = 500;

const STOP_REASON_LABEL: Record<StopReason | 'queue_empty', string> = {
  time_limit:  '時間上限に達した',
  match_limit: '試合数上限に達した',
  queue_empty: 'キューが空になった',
};

// 環境変数を読み込む（不正な値ならエラーで止める）
function loadConfig() {
  return {
    platform:      parseTargetRegion(process.env.TARGET_REGIONS),
    targetTiers:   parseTargetTiers(process.env.TARGET_TIERS),
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
  const { platform, targetTiers, maxDurationMs, maxMatches } = loadConfig();
  const client = new RiotClient(platform);
  const region  = platform.replace(/[0-9]/g, '').toUpperCase(); // "jp1" → "JP"
  const tiersLabel = targetTiers.join(',');
  console.log(`[collect] 終了条件: 時間上限 ${maxDurationMs / 60_000}分 / 試合数上限 ${maxMatches ?? 'なし'}`);

  // ① APIキー事前検証（失効していれば即座に失敗させる）
  await client.validateApiKey();

  // ② 最新パッチ取得 + champions 同期
  const patch = await fetchLatestPatch();
  console.log(`[collect] 対象パッチ: ${patch} / リージョン: ${region} / 収集対象ランク: ${tiersLabel}`);
  await syncChampions(patch);

  // ③ collection_logs にジョブ開始を記録（rank_tier には収集対象ランクの設定を残す）
  const logId = await startLog({ patch, region, rank_tier: tiersLabel, status: 'running', started_at: new Date().toISOString() });
  // DB に書き込み終えた試合数を数える。途中で失敗したときも collection_logs に残す（02 ステップ7）
  const writer = createChunkWriter(patch, region);

  try {
    // ③' 古いパッチのアイテムビルドと処理済み試合IDを消す（容量を守るため。要件 FR-23）
    const archived = await archiveOldPatches(patch);
    console.log(`[collect] 古いパッチの削除: ${archived}行`);

    // ④ 名簿（Platinum 以上の全プレイヤーのランク）を作る。試合の平均ランクの計算とシードに使う
    console.log('[collect] 名簿を作成中...');
    const roster = await buildRoster(client);

    // ⑤ 処理済み試合IDをDBから取得してスノーボールの重複除去に使用
    const processedIds = await getProcessedMatchIds(patch);
    console.log(`[collect] 既処理済み試合: ${processedIds.size}件`);

    // ⑥ スノーボールメインループ（scripts/collector.ts）
    // スノーボールではキューがほぼ空にならないため、時間上限・試合数上限のうち先に達した方で止める
    const result = await collectMatches(client, {
      patch,
      region,
      targetTiers,
      roster,
      seedPools:        groupRosterByTier(roster),
      processedIds,
      seedsPerTier:     SEED_PLAYERS_PER_TIER,
      matchesPerPlayer: MATCHES_PER_PLAYER,
      shouldStop: totalMatches => getStopReason({
        elapsedMs: Date.now() - PROCESS_STARTED_AT,
        maxDurationMs,
        totalMatches,
        maxMatches,
      }),
      onProgress: (totalMatches, collected) => {
        if (totalMatches % 100 === 0) {
          console.log(`[collect] 処理済み試合: ${totalMatches}件 / 収集元ランク別: ${formatCollected(collected, targetTiers)}`);
        }
      },
      // ⑦ 集計結果の加算と処理済み試合IDの記録を、WRITE_EVERY_MATCHES 試合ごとに1トランザクションで書き込む
      writeEvery: WRITE_EVERY_MATCHES,
      onWrite: async (aggregation, matchIds) => {
        console.log(`[collect] DBに書き込み中... (${matchIds.length}試合分)`);
        const counts = await writer.write(aggregation, matchIds);
        // アイテムビルドを書き込まない間（WRITE_ITEM_BUILDS = false）は、常に0件なので表示しない
        const itemText = WRITE_ITEM_BUILDS ? ` / item_build_stats: ${counts.itemRows}件` : '';
        console.log(`[collect] champion_stats: ${counts.championRows}件 / counter_stats: ${counts.counterRows}件${itemText} を加算（書き込み済み 累計 ${writer.written()}試合）`);
      },
    });
    const totalMatches = result.matchIds.length;

    console.log(`[collect] ループ終了: ${STOP_REASON_LABEL[result.stopReason]}（処理済み ${totalMatches}試合 / 経過 ${Math.round((Date.now() - PROCESS_STARTED_AT) / 60_000)}分）`);
    console.log(`[collect] 収集元ランク別: ${formatCollected(result.collected, targetTiers)} / ランク帯別の加算試合数: ${JSON.stringify(result.rankTierCounts)}`);

    if (totalMatches === 0) {
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
    // 致命的エラーを collection_logs に記録して、呼び出し元（main）に伝える。標準出力への表示は main で行う
    const message = err instanceof Error ? err.message : String(err);
    await updateLog(logId, {
      status:            'failed',
      matches_collected: writer.written(), // 途中まで書き込んだ試合は DB に残っているため、その数を記録する
      error_message:     message,
      completed_at:      new Date().toISOString(),
    });
    throw err;
  }
}

function formatCollected(collected: Record<CollectTier, number>, tiers: readonly CollectTier[]): string {
  return tiers.map(t => `${t} ${collected[t]}`).join(' / ');
}

// エントリーポイント
// エラーはここで必ず表示してから終了コード 1 で終わる。開始ログより前のエラー（設定値の誤り・APIキーの失効など）は
// collection_logs に残らないため、表示しないと GitHub Actions のログでも原因がわからない
async function main(): Promise<void> {
  try {
    await runCollection();
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[collect] 致命的なエラー:', message);
    process.exit(1);
  }
}

main();
