// 結合テスト DB-01〜11（docs/06_batch-test-spec.html 5.7節）をローカルの Supabase で確かめる
// 実行: npm run it:db（ローカルの DB を初期状態に戻してから実行する）
// - 接続先と鍵は `npx supabase status` から取る。ローカル以外の接続先なら実行しない（本番データを汚さないため）
// - 初期状態（champions が空）でなければ実行しない。結果が前回の実行に左右されないようにするため
// - 項目は上から順に、前の項目で入れたデータを使う（DB-02・04 は DB-01、DB-06 は DB-01 の試合 IT_01）。前の項目が NG なら後ろも NG になる
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function localSupabaseEnv(): { url: string; serviceRoleKey: string; anonKey: string } {
  // stderr は捨てずに表示する（起動していないときの原因がわかるように）
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const env = Object.fromEntries(
    out.split('\n')
      .map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map(m => [m[1], m[2]]),
  );
  const url = env.API_URL;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error(`ローカルの Supabase に接続できません（API_URL: ${url ?? 'なし'}）。npx supabase start で起動してください`);
  }
  return { url, serviceRoleKey: env.SERVICE_ROLE_KEY, anonKey: env.ANON_KEY };
}

const local = localSupabaseEnv();
const admin = createClient(local.url, local.serviceRoleKey, { auth: { persistSession: false } });
const anon  = createClient(local.url, local.anonKey,        { auth: { persistSession: false } });

const PATCH = '16.21';
const REGION = 'JP';
const results: Array<{ id: string; ok: boolean; detail: string }> = [];
const record = (id: string, ok: boolean, detail: string) => { results.push({ id, ok, detail }); console.log(`${ok ? 'OK  ' : 'NG  '} ${id}: ${detail}`); };

type Row = Record<string, unknown>;
const champ = (champion_id: number, rank_tier: string, games_played: number, wins: number, lane = 'MID'): Row =>
  ({ champion_id, lane, rank_tier, games_played, wins });

async function apply(client: typeof admin, p: { champion?: Row[]; counter?: Row[]; item?: Row[]; matchIds: string[] }) {
  return client.rpc('apply_batch_result', {
    p_patch: PATCH, p_region: REGION,
    p_champion_rows: p.champion ?? [], p_counter_rows: p.counter ?? [], p_item_rows: p.item ?? [],
    p_match_ids: p.matchIds,
  });
}

async function championRow(champion_id: number, rank_tier: string, lane = 'MID') {
  const { data, error } = await admin.from('champion_stats').select('games_played, wins, win_rate')
    .match({ champion_id, lane, patch: PATCH, region: REGION, rank_tier });
  if (error) throw error;
  return data;
}

// 3テーブル + processed_matches の行数と games_played の合計
async function snapshot() {
  const out: Record<string, unknown> = {};
  for (const t of ['champion_stats', 'counter_stats', 'item_build_stats']) {
    const { data, error } = await admin.from(t).select('games_played, wins');
    if (error) throw error;
    out[t] = { rows: data.length, games: data.reduce((a, r) => a + r.games_played, 0), wins: data.reduce((a, r) => a + r.wins, 0) };
  }
  const { count, error } = await admin.from('processed_matches').select('*', { count: 'exact', head: true });
  if (error) throw error;
  out.processed_matches = count;
  return JSON.stringify(out);
}

async function main() {
  // 初期状態か確認する
  {
    const { count, error } = await admin.from('champions').select('*', { count: 'exact', head: true });
    if (error) throw error;
    if (count !== 0) throw new Error('DB が初期状態ではありません。npx supabase db reset の後に実行してください（npm run it:db なら自動で行います）');
  }

  // 準備: 外部キーのためのテスト用チャンピオン
  {
    const { error } = await admin.from('champions').insert([1, 2, 3].map(id => ({ champion_id: id, champion_key: `IT${id}`, champion_name: `テスト${id}` })));
    if (error) throw error;
  }

  // DB-01
  {
    const { error } = await apply(admin, { champion: [champ(1, 'all', 10, 6)], matchIds: ['IT_01'] });
    const rows = await championRow(1, 'all');
    const r = rows[0];
    record('DB-01', !error && rows.length === 1 && r.games_played === 10 && r.wins === 6 && Number(r.win_rate) === 0.6,
      `error=${error?.message ?? 'なし'} rows=${JSON.stringify(rows)}`);
  }

  // DB-02
  {
    const { error } = await apply(admin, { champion: [champ(1, 'all', 10, 7)], matchIds: ['IT_02'] });
    const rows = await championRow(1, 'all');
    const r = rows[0];
    record('DB-02', !error && rows.length === 1 && r.games_played === 20 && r.wins === 13 && Number(r.win_rate) === 0.65,
      `error=${error?.message ?? 'なし'} rows=${JSON.stringify(rows)}`);
  }

  // DB-03
  {
    const { error } = await apply(admin, { champion: [champ(2, 'all', 3, 1)], matchIds: ['IT_03'] });
    const rows = await championRow(2, 'all');
    record('DB-03', !error && rows.length === 1 && String(rows[0].win_rate) === '0.3333',
      `error=${error?.message ?? 'なし'} win_rate=${JSON.stringify(rows[0]?.win_rate)}`);
  }

  // DB-04
  {
    const { error } = await apply(admin, { champion: [champ(1, 'platinum_plus', 5, 2)], matchIds: ['IT_04'] });
    const plat = await championRow(1, 'platinum_plus');
    const all = await championRow(1, 'all');
    record('DB-04', !error && plat.length === 1 && plat[0].games_played === 5 && all.length === 1 && all[0].games_played === 20,
      `error=${error?.message ?? 'なし'} platinum_plus=${JSON.stringify(plat)} all=${JSON.stringify(all)}`);
  }

  // DB-05
  {
    const { error } = await apply(admin, { matchIds: ['IT_05a', 'IT_05b'] });
    const { data } = await admin.from('processed_matches').select('match_id, patch').in('match_id', ['IT_05a', 'IT_05b']).order('match_id');
    record('DB-05', !error && data?.length === 2 && data.every(r => r.patch === PATCH),
      `error=${error?.message ?? 'なし'} rows=${JSON.stringify(data)}`);
  }

  // DB-06
  {
    const before = await snapshot();
    const { error } = await apply(admin, {
      champion: [champ(1, 'all', 1, 1)],
      counter:  [{ champion_id: 1, enemy_champion_id: 2, lane: 'MID', rank_tier: 'all', games_played: 1, wins: 1 }],
      item:     [{ champion_id: 1, lane: 'MID', rank_tier: 'all', item_ids: '3031', games_played: 1, wins: 1 }],
      matchIds: ['IT_06_new', 'IT_01'],
    });
    const after = await snapshot();
    const { count } = await admin.from('processed_matches').select('*', { count: 'exact', head: true }).eq('match_id', 'IT_06_new');
    // 関数は重複を見つけると書き込む前に止まる。書き込んだ後の取り消しは DB-07 で確かめる
    record('DB-06', error?.code === 'P0001' && /処理済みの試合が 1 件含まれています/.test(error.message) && before === after && count === 0,
      `error=${error?.code} ${error?.message ?? 'なし'} 変化なし=${before === after} IT_06_new=${count}件`);
  }

  // DB-07
  {
    const before = await snapshot();
    const { error } = await apply(admin, { champion: [champ(1, 'all', 1, 1), champ(9999, 'all', 1, 1)], matchIds: ['IT_07'] });
    const after = await snapshot();
    // processed_matches と champion 1 の行を書いた後に外部キー違反（23503）になるので、書き込んだ後の取り消しを確かめられる
    record('DB-07', error?.code === '23503' && before === after,
      `error=${error?.code} ${error?.message ?? 'なし'} 変化なし=${before === after}`);
  }

  // DB-08（バッチと同じ getProcessedMatchIds を使う）
  {
    const cases: Array<[string, number]> = [['90.1', 999], ['90.2', 1000], ['90.3', 1001], ['90.4', 2000]];
    const rows = cases.flatMap(([patch, n]) => Array.from({ length: n }, (_, i) => ({ match_id: `IT08_${patch}_${i}`, patch })));
    rows.push(...Array.from({ length: 5 }, (_, i) => ({ match_id: `IT08_other_${i}`, patch: '90.9' })));
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await admin.from('processed_matches').insert(rows.slice(i, i + 1000));
      if (error) throw error;
    }
    // scripts/supabase.ts は読み込み時に環境変数を読むので、先にローカルの値を入れる
    process.env.SUPABASE_URL = local.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = local.serviceRoleKey;
    const { getProcessedMatchIds } = await import('../supabaseWriter');
    const got: string[] = [];
    let ok = true;
    for (const [patch, n] of cases) {
      const ids = await getProcessedMatchIds(patch);
      const clean = [...ids].every(id => id.startsWith(`IT08_${patch}_`));
      got.push(`${patch}: ${ids.size}/${n}${clean ? '' : '（別パッチ混入）'}`);
      ok &&= ids.size === n && clean;
    }
    record('DB-08', ok, got.join(' / '));
  }

  // DB-09
  {
    const { error } = await apply(anon, { champion: [champ(3, 'all', 1, 1)], matchIds: ['IT_09'] });
    const rows = await championRow(3, 'all');
    record('DB-09', error?.code === '42501' && rows.length === 0, `error=${error?.code} ${error?.message ?? 'なし'} 書き込まれた行=${rows.length}`);
  }

  // DB-10
  {
    const detail: string[] = [];
    let ok = true;
    const tables: Array<[string, Row, Row]> = [
      ['champions',        { champion_id: 3 }, { champion_id: 4, champion_key: 'IT4', champion_name: 'x' }],
      ['champion_stats',   { champion_id: 1 }, { ...champ(3, 'all', 1, 1), patch: PATCH, region: REGION }],
      ['counter_stats',    { champion_id: 1 }, { champion_id: 3, enemy_champion_id: 2, lane: 'MID', patch: PATCH, region: REGION, rank_tier: 'all', games_played: 1, wins: 1 }],
      ['item_build_stats', { champion_id: 1 }, { champion_id: 3, lane: 'MID', patch: PATCH, region: REGION, rank_tier: 'all', item_ids: '1', games_played: 1, wins: 1 }],
    ];
    // DB-06 は取り消されたので counter・item は空。SELECT の確認用に1行ずつ入れておく
    for (const [table, row] of [
      ['counter_stats',    { champion_id: 1, enemy_champion_id: 2, lane: 'MID', patch: PATCH, region: REGION, rank_tier: 'all', games_played: 1, wins: 1, win_rate: 1 }],
      ['item_build_stats', { champion_id: 1, lane: 'MID', patch: PATCH, region: REGION, rank_tier: 'all', item_ids: '3031', games_played: 1, wins: 1, win_rate: 1 }],
    ] as const) {
      const { error } = await admin.from(table).insert(row);
      if (error) throw error;
    }

    for (const [table, match, insertRow] of tables) {
      const before = await snapshot() + JSON.stringify((await admin.from('champions').select('*').order('champion_id')).data);
      const sel = await anon.from(table).select('*');
      const ins = await anon.from(table).insert(insertRow);
      const upd = await anon.from(table).update(table === 'champions' ? { champion_name: '改ざん' } : { games_played: 999 }).match(match).select();
      const del = await anon.from(table).delete().match(match).select();
      const after = await snapshot() + JSON.stringify((await admin.from('champions').select('*').order('champion_id')).data);
      const selOk = !sel.error && (sel.data?.length ?? 0) > 0;
      const unchanged = before === after;
      // INSERT は権限エラー、UPDATE・DELETE はエラーにならず 0行（04「anon キーで操作したときの結果」）
      const insOk = ins.error?.code === '42501';
      const updOk = !upd.error && upd.data?.length === 0;
      const delOk = !del.error && del.data?.length === 0;
      ok &&= selOk && insOk && updOk && delOk && unchanged;
      detail.push(`${table}: SELECT ${sel.data?.length ?? 'エラー'}行 / INSERT ${ins.error ? `拒否(${ins.error.code})` : '成功'} / UPDATE ${upd.error ? `拒否(${upd.error.code})` : `${upd.data?.length}行`} / DELETE ${del.error ? `拒否(${del.error.code})` : `${del.data?.length}行`} / データ変化なし=${unchanged}`);
    }
    record('DB-10', ok, '\n    ' + detail.join('\n    '));
  }

  // DB-11
  {
    const { error: logError } = await admin.from('collection_logs').insert({ patch: PATCH, region: REGION, rank_tier: 'PLATINUM', status: 'completed', started_at: new Date().toISOString() });
    if (logError) throw logError;
    const detail: string[] = [];
    let ok = true;
    for (const table of ['collection_logs', 'processed_matches']) {
      const { count: adminCount } = await admin.from(table).select('*', { count: 'exact', head: true });
      const { data, error } = await anon.from(table).select('*');
      // エラーにならず 0行（04「anon キーで操作したときの結果」）。service_role では行があることも確かめる
      ok &&= (adminCount ?? 0) > 0 && !error && data?.length === 0;
      detail.push(`${table}: 実際 ${adminCount}行 / anon ${error ? `エラー(${error.code})` : `${data?.length}行`}`);
    }
    record('DB-11', ok, detail.join(' / '));
  }

  const ng = results.filter(r => !r.ok);
  console.log(`\n結果: ${results.length - ng.length}/${results.length} 合格${ng.length ? `（不合格: ${ng.map(r => r.id).join(', ')}）` : ''}`);
  process.exitCode = ng.length ? 1 : 0;
}

main().catch(err => { console.error(err); process.exitCode = 2; });
