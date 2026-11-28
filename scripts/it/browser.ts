// ブラウザテスト BR-01〜07（docs/07_ui-test-spec.html 7章）を、ローカルの本番ビルドと本物の Chrome で確かめる
// 実行: npm run it:browser（next build の後、このスクリプトが next start を起動し、終わったら止める）
// - 開発サーバーは使わない。React の StrictMode が副作用を2回動かし、API の回数が変わるため
// - 接続先は自分で起動した localhost だけ。ポートがすでに使われていたら実行しない（別のサーバーを試験しないため）
// - 項目ごとに新しいブラウザコンテキスト（空の localStorage）で始めるので、項目どうしの依存はない
// - API はモックデータ（05 の 6章）。外部への通信はしない
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';

const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const STORAGE_KEY = 'lol-pick-tool:filters';
const LANE_NAMES = ['TOP', 'JG', 'MID', 'BOT', 'SUP'];
// 選択中のレーンの色（03 の配色 #c89b3c）
const GOLD = 'rgb(200, 155, 60)';
// 回数を数える前に待つ時間。待たずに数えると、余分な2回目が来る前に合格するため（07 の 2.5 A-4・B-1）。色の切り替え（150ミリ秒）も待つ
const SETTLE_MS = 700;

const results: Array<{ id: string; ok: boolean }> = [];

/** 観測した値と期待する値を、全体で比べて記録する。違えば両方を出す */
function record(id: string, label: string, actual: unknown, expected: unknown): void {
  const ok = isDeepStrictEqual(actual, expected);
  results.push({ id, ok });
  console.log(`${ok ? 'OK  ' : 'NG  '} ${id} ${label}`);
  if (!ok) {
    console.log(`       期待: ${JSON.stringify(expected)}`);
    console.log(`       実際: ${JSON.stringify(actual)}`);
  }
}

interface Session {
  context: BrowserContext;
  page: Page;
  /** `/api/` へのリクエスト（古い順）。`clear()` で空にする */
  apiCalls: URL[];
  /** Console のエラーと、捕まえられなかった例外 */
  errors: string[];
  clear: () => void;
}

async function openSession(context: BrowserContext): Promise<Session> {
  const apiCalls: URL[] = [];
  const errors: string[] = [];
  context.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(url);
  });
  const page = context.pages()[0] ?? await context.newPage();
  // ブラウザのキャッシュを使わない（DevTools の「Disable cache」と同じ）。API の応答に stale-while-revalidate が付いていて、
  // 使うと、読み込み直したときにブラウザが再検証のリクエストを足し、同じ URL が2回になるため
  const cdp = await context.newCDPSession(page);
  // Network.enable を先に送らないと、キャッシュの無効化が効かない（2026-11-28 に確認）
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(`${err.name}: ${err.message}`); });
  return { context, page, apiCalls, errors, clear: () => { apiCalls.length = 0; errors.length = 0; } };
}

/**
 * パッチの選択肢が入り、「読み込み中」が消えるまで待ってから、さらに SETTLE_MS 待つ。
 * 画面を移った後、前の画面が隠れたまま DOM に残ることがある（next.config.ts の cacheComponents）ので、見えている選択欄だけを見る
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const patchSelect = Array.from(document.querySelectorAll('select')).filter((s) => s.offsetParent !== null)[2];
    return patchSelect !== undefined && patchSelect.options.length > 0 && !document.body.innerText.includes('読み込み中');
  }, undefined, { timeout: 15000 });
  await page.waitForTimeout(SETTLE_MS);
}

async function open(page: Page, pathname: string): Promise<void> {
  await page.goto(`${BASE}${pathname}`);
  await settle(page);
}

async function reload(s: Session): Promise<void> {
  s.clear();
  await s.page.reload();
  await settle(s.page);
}

async function clickLane(page: Page, lane: string): Promise<void> {
  await page.getByRole('button', { name: lane, exact: true }).click();
  await settle(page);
}

// select は左から リージョン・ランク帯・パッチ（03 SCR-02・SCR-03/04 のフィルターバー）。見えている画面のものを選ぶ
async function choose(page: Page, index: 0 | 1 | 2, value: string): Promise<void> {
  await page.locator('select:visible').nth(index).selectOption(value);
  await settle(page);
}

interface Screen {
  /** 金色（選択中）のレーン。1つだけのはず */
  lanes: string[];
  region: string;
  tier: string;
  patch: string;
  /** role="alert" の文言（取得できないときの表示） */
  alerts: string[];
}

async function screen(page: Page): Promise<Screen> {
  return page.evaluate(({ laneNames, gold }) => {
    // 前の画面が隠れたまま DOM に残ることがあるので、選択欄・ボタン・alert のどれも、見えているもの（offsetParent がある）だけを読む
    // （ブラウザに渡す関数の中では、名前を付けた関数を作らない。tsx が足す補助の関数がブラウザにはなく、ReferenceError になるため）
    const selects = Array.from(document.querySelectorAll('select')).filter((s) => s.offsetParent !== null).map((s) => s.value);
    return {
      lanes: Array.from(document.querySelectorAll('button'))
        .filter((b) => b.offsetParent !== null && laneNames.includes(b.textContent ?? '') && getComputedStyle(b).backgroundColor === gold)
        .map((b) => b.textContent ?? ''),
      region: selects[0] ?? '',
      tier: selects[1] ?? '',
      patch: selects[2] ?? '',
      alerts: Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]')).filter((e) => e.offsetParent !== null).map((e) => e.textContent ?? ''),
    };
  }, { laneNames: LANE_NAMES, gold: GOLD });
}

/** 保存値。キーがなければ null、JSON でなければ文字列のまま返す */
async function saved(page: Page): Promise<unknown> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function seed(page: Page, raw: string): Promise<void> {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: raw });
}

/**
 * 指定したパスへのリクエストのクエリのうち、絞り込み条件の4つ（lane・patch・region・tier）。
 * 省略された region・tier は API の既定値（05 の 3章）に読み替える。ほかのパラメーター（limit・min_games）は見ない
 */
function queries(s: Session, pathname: string): Array<Record<string, string | null>> {
  return s.apiCalls.filter((u) => u.pathname === pathname).map((u) => ({
    lane: u.searchParams.get('lane'),
    patch: u.searchParams.get('patch'),
    region: u.searchParams.get('region') ?? 'JP',
    tier: u.searchParams.get('tier') ?? 'platinum_plus',
  }));
}

/** 見えている一覧の行（「12,345 games」で終わる要素）の数 */
async function gameRows(page: Page): Promise<number> {
  return page.locator('span:visible', { hasText: /\d games$/ }).count();
}

const championQuery = (lane: string, region: string, tier: string, patch: string): Record<string, string | null> =>
  ({ lane, patch, region, tier });

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`next start が終了しました（終了コード ${server.exitCode}）。npm run build が済んでいるか確かめてください`);
    try {
      const res = await fetch(`${BASE}/api/patches`);
      if (res.ok) return;
    } catch { /* まだ起動していない */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('next start が 30秒以内に応答しませんでした');
}

async function isPortInUse(): Promise<boolean> {
  try { await fetch(BASE); return true; } catch { return false; }
}

async function withSession(browser: Browser, run: (s: Session) => Promise<void>): Promise<void> {
  const context = await browser.newContext();
  try { await run(await openSession(context)); } finally { await context.close(); }
}

/** 項目の途中で例外（待ち時間切れなど）が出たら、その項目を NG にして次へ進む */
async function item(id: string, run: () => Promise<void>): Promise<void> {
  try { await run(); } catch (err) {
    results.push({ id, ok: false });
    console.log(`NG   ${id} 途中で止まりました: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  }
}

async function runItems(browser: Browser, patches: string[]): Promise<void> {
  const latest = patches[0];
  const older = patches[1];

  // BR-01 先出しピック: 変えた条件が、読み込み直した後も選ばれている（01 FR-08 (1)）
  await item('BR-01', () => withSession(browser, async (s) => {
    await open(s.page, '/first-pick');
    await clickLane(s.page, 'JG');
    await choose(s.page, 1, 'master_plus');
    await choose(s.page, 0, 'KR');
    await reload(s);
    record('BR-01', '画面の選択', await screen(s.page), { lanes: ['JG'], region: 'KR', tier: 'master_plus', patch: latest, alerts: [] });
    record('BR-01', '保存値', await saved(s.page), { v: 1, lane: 'JG', region: 'KR', tier: 'master_plus' });
    record('BR-01', '/api/champions は1回で、覚えた値', queries(s, '/api/champions'), [championQuery('JG', 'KR', 'master_plus', latest)]);
  }));

  // BR-02 カウンターピック: 条件は覚え、相手チャンピオンと検索の文字は覚えない（01 FR-08 (1)・補足）
  await item('BR-02', () => withSession(browser, async (s) => {
    await open(s.page, '/counter-pick');
    await clickLane(s.page, 'BOT');
    await choose(s.page, 1, 'all');
    await choose(s.page, 0, 'EUW');
    await s.page.locator('button[title]').first().click();
    await settle(s.page);
    await s.page.getByPlaceholder('検索').fill('a');
    // 相手を選べていなければ、「覚えていない」ことの確認にならない
    record('BR-02', '前提: 読み込み直す前は、相手を選んでいて検索に文字がある', {
      counterCalls: queries(s, '/api/counter').length > 0,
      search: await s.page.getByPlaceholder('検索').inputValue(),
    }, { counterCalls: true, search: 'a' });
    await reload(s);
    record('BR-02', '画面の選択', await screen(s.page), { lanes: ['BOT'], region: 'EUW', tier: 'all', patch: latest, alerts: [] });
    record('BR-02', '保存値', await saved(s.page), { v: 1, lane: 'BOT', region: 'EUW', tier: 'all' });
    record('BR-02', '/api/champions は1回で、覚えた値', queries(s, '/api/champions'), [championQuery('BOT', 'EUW', 'all', latest)]);
    record('BR-02', '相手は未選択で、検索は空', {
      counterCalls: queries(s, '/api/counter').length,
      search: await s.page.getByPlaceholder('検索').inputValue(),
      prompt: await s.page.getByText('相手チャンピオンを選択してください').count(),
    }, { counterCalls: 0, search: '', prompt: 1 });
  }));

  // BR-03 2つの画面で条件を共有する（01 FR-08 (2)・FR-13）
  await item('BR-03', () => withSession(browser, async (s) => {
    await open(s.page, '/first-pick');
    await clickLane(s.page, 'SUP');
    await choose(s.page, 1, 'diamond_plus');
    await choose(s.page, 0, 'KR');
    s.clear();
    await s.page.getByRole('link', { name: 'カウンター', exact: true }).click();
    await s.page.waitForURL('**/counter-pick');
    await settle(s.page);
    record('BR-03', 'A: カウンターピックの選択', await screen(s.page), { lanes: ['SUP'], region: 'KR', tier: 'diamond_plus', patch: latest, alerts: [] });
    record('BR-03', 'A: /api/champions は1回で、先出しピックで選んだ値', queries(s, '/api/champions'), [championQuery('SUP', 'KR', 'diamond_plus', latest)]);
    await clickLane(s.page, 'TOP');
    await choose(s.page, 1, 'master_plus');
    await choose(s.page, 0, 'NA');
    s.clear();
    await s.page.getByRole('link', { name: '先出しピック', exact: true }).click();
    await s.page.waitForURL('**/first-pick');
    await settle(s.page);
    record('BR-03', 'B: 先出しピックの選択', await screen(s.page), { lanes: ['TOP'], region: 'NA', tier: 'master_plus', patch: latest, alerts: [] });
    record('BR-03', 'B: /api/champions は1回で、カウンターピックで選んだ値', queries(s, '/api/champions'), [championQuery('TOP', 'NA', 'master_plus', latest)]);
  }));

  // BR-04 パッチは覚えず、開くたびに最新を選ぶ（01 FR-03・FR-08 (3)）
  for (const pathname of ['/first-pick', '/counter-pick']) {
    await item('BR-04', () => withSession(browser, async (s) => {
      await open(s.page, pathname);
      await clickLane(s.page, 'JG');
      const before = await saved(s.page);
      s.clear();
      await choose(s.page, 2, older);
      // 古いパッチを選べていなければ、「最新に戻る」ことの確認にならない
      record('BR-04', `${pathname} 前提: 古いパッチを選ぶと、そのパッチで取り直す`, queries(s, '/api/champions'), [championQuery('JG', 'JP', 'platinum_plus', older)]);
      record('BR-04', `${pathname} パッチを変えても保存値は変わらず、patch を含まない`, { before, after: await saved(s.page) }, {
        before: { v: 1, lane: 'JG', region: 'JP', tier: 'platinum_plus' },
        after: { v: 1, lane: 'JG', region: 'JP', tier: 'platinum_plus' },
      });
      await reload(s);
      record('BR-04', `${pathname} 読み込み直すと最新のパッチ`, await screen(s.page), { lanes: ['JG'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] });
      record('BR-04', `${pathname} /api/champions は1回で、最新のパッチ`, queries(s, '/api/champions'), [championQuery('JG', 'JP', 'platinum_plus', latest)]);
    }));
  }

  // BR-05 使えない保存値は、その項目だけ既定値にする（01 FR-08 (4)、03 の 5.3）
  await item('BR-05', () => withSession(browser, async (s) => {
    const partial = '{"v":1,"lane":"ADC","region":"KR","tier":"diamond_plus"}';
    await open(s.page, '/first-pick');
    await seed(s.page, partial);
    await reload(s);
    record('BR-05', 'A: 先出しピックはレーンだけ既定値（MID）', await screen(s.page), { lanes: ['MID'], region: 'KR', tier: 'diamond_plus', patch: latest, alerts: [] });
    record('BR-05', 'A: /api/champions は1回', queries(s, '/api/champions'), [championQuery('MID', 'KR', 'diamond_plus', latest)]);
    s.clear();
    await open(s.page, '/counter-pick');
    record('BR-05', 'B: カウンターピックはレーンだけ既定値（TOP）', await screen(s.page), { lanes: ['TOP'], region: 'KR', tier: 'diamond_plus', patch: latest, alerts: [] });
    record('BR-05', 'B: /api/champions は1回', queries(s, '/api/champions'), [championQuery('TOP', 'KR', 'diamond_plus', latest)]);
    record('BR-05', 'A・B: 使えない保存値を書き戻さない', await s.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), partial);
    await open(s.page, '/first-pick');
    await seed(s.page, 'not json');
    await reload(s);
    record('BR-05', 'C: JSON でない保存値は、すべて既定値', await screen(s.page), { lanes: ['MID'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] });
    record('BR-05', 'C: /api/champions は1回', queries(s, '/api/champions'), [championQuery('MID', 'JP', 'platinum_plus', latest)]);
    record('BR-05', 'C: 使えない保存値を書き戻さない', await s.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), 'not json');
    record('BR-05', 'C: Console のエラーと例外がない', s.errors, []);
  }));

  // BR-07 保存値があるとき、既定値では API を呼ばず、覚えた値で1回だけ呼ぶ（03 の 5.4）。描画の食い違いのエラーも出ない
  for (const pathname of ['/first-pick', '/counter-pick']) {
    await item('BR-07', () => withSession(browser, async (s) => {
      await open(s.page, pathname);
      await seed(s.page, '{"v":1,"lane":"SUP","region":"KR","tier":"master_plus"}');
      await reload(s);
      record('BR-07', `${pathname} /api/champions はちょうど1回で、覚えた値（既定値のレーンでは呼ばない）`, queries(s, '/api/champions'), [championQuery('SUP', 'KR', 'master_plus', latest)]);
      record('BR-07', `${pathname} 画面の選択も覚えた値（サーバーで描いた既定値のまま残らない）`, await screen(s.page), { lanes: ['SUP'], region: 'KR', tier: 'master_plus', patch: latest, alerts: [] });
      record('BR-07', `${pathname} /api/patches は1回`, queries(s, '/api/patches').length, 1);
      record('BR-07', `${pathname} Console のエラーと例外がない（本番ビルドでは、描画の食い違いは Minified React error として出る）`, s.errors, []);
    }));
  }
}

// BR-06 サイトのデータの保存を許さない設定でも、覚えないだけで今までどおり動く（01 FR-08 (5)、03 の 5.3 4行目）
// Chrome の「サイトにデータの保存を許可しない」設定を、プロフィールの設定ファイルで入れて起動する
async function runBlockedStorageItem(patches: string[]): Promise<void> {
  const latest = patches[0];
  const profileDir = mkdtempSync(path.join(tmpdir(), 'lol-pick-tool-it-'));
  mkdirSync(path.join(profileDir, 'Default'), { recursive: true });
  // 2 は「ブロック」。chrome://settings/content/siteData の「サイトにデータの保存を許可しない」と同じ設定
  writeFileSync(path.join(profileDir, 'Default', 'Preferences'), JSON.stringify({ profile: { default_content_setting_values: { cookies: 2 } } }));
  const context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true });
  try {
    await item('BR-06', async () => {
      const s = await openSession(context);
      await open(s.page, '/first-pick');
      // 状態を作れていなければ（'OK' が返れば）、後ろの確認は意味がないので NG にする
      const probe = await s.page.evaluate(() => { try { void localStorage; return 'OK'; } catch (e) { return e instanceof Error ? e.name : String(e); } });
      record('BR-06', '前提: localStorage を参照すると SecurityError になる', probe, 'SecurityError');
      await reload(s);
      record('BR-06', 'A: 既定値で表示する', await screen(s.page), { lanes: ['MID'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] });
      record('BR-06', 'A: /api/champions は1回', queries(s, '/api/champions'), [championQuery('MID', 'JP', 'platinum_plus', latest)]);
      record('BR-06', 'A: チャンピオンの一覧が1行以上ある', await gameRows(s.page) > 0, true);
      s.apiCalls.length = 0;
      await clickLane(s.page, 'JG');
      record('BR-06', 'B: レーンを変えると、その値で取り直す', { screen: await screen(s.page), calls: queries(s, '/api/champions') },
        { screen: { lanes: ['JG'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] }, calls: [championQuery('JG', 'JP', 'platinum_plus', latest)] });
      record('BR-06', 'B: チャンピオンの一覧が1行以上ある', await gameRows(s.page) > 0, true);
      const errorsBeforeReload = [...s.errors];
      await reload(s);
      record('BR-06', 'C: 読み込み直すと既定値に戻る（覚えていない）', await screen(s.page), { lanes: ['MID'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] });
      const errorsBeforeMove = [...s.errors];
      s.clear();
      await open(s.page, '/counter-pick');
      await clickLane(s.page, 'BOT');
      const enemies = await s.page.locator('button[title]').count();
      s.apiCalls.length = 0;
      await s.page.locator('button[title]').first().click();
      await settle(s.page);
      const counterCalls = queries(s, '/api/counter');
      record('BR-06', 'D: 相手の一覧が出て、選ぶと /api/counter を lane=BOT で1回呼ぶ', {
        hasEnemies: enemies > 0,
        calls: counterCalls.length,
        lane: counterCalls[0]?.lane,
        screen: await screen(s.page),
      }, { hasEnemies: true, calls: 1, lane: 'BOT', screen: { lanes: ['BOT'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] } });
      // モックデータのカウンターは TOP のダリウスだけ（lib/mock-data.ts）。BOT では空の応答になり、文言が出る
      record('BR-06', 'D: カウンターデータがない相手では「データが不足しています」が出る', {
        rows: await gameRows(s.page),
        shortage: await s.page.getByText('データが不足しています').count(),
      }, { rows: 0, shortage: 1 });
      // E: カウンターデータがある相手（TOP のダリウス）では、一覧が出る
      await clickLane(s.page, 'TOP');
      s.apiCalls.length = 0;
      await s.page.locator('button[title="ダリウス"]').click();
      await settle(s.page);
      const dariusCalls = queries(s, '/api/counter');
      record('BR-06', 'E: データがある相手を選ぶと、/api/counter を lane=TOP で1回呼び、カウンターの一覧が出る', {
        calls: dariusCalls.length,
        lane: dariusCalls[0]?.lane,
        screen: await screen(s.page),
        hasRows: await gameRows(s.page) > 0,
        shortage: await s.page.getByText('データが不足しています').count(),
      }, { calls: 1, lane: 'TOP', screen: { lanes: ['TOP'], region: 'JP', tier: 'platinum_plus', patch: latest, alerts: [] }, hasRows: true, shortage: 0 });
      record('BR-06', 'A〜E: Console のエラーと例外がない', [...errorsBeforeReload, ...errorsBeforeMove, ...s.errors], []);
    });
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (await isPortInUse()) throw new Error(`ポート ${PORT} がすでに使われています。止めてから実行してください`);
  // npx を挟むと、止めるときのシグナルが next に届かず、ポートにサーバーが残ることがあるので、next を node で直接起動する
  const server = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await waitForServer(server);
    const patchesBody: unknown = await (await fetch(`${BASE}/api/patches`)).json();
    const patches = Array.isArray(patchesBody) ? patchesBody.filter((p): p is string => typeof p === 'string') : [];
    // BR-04 は、最新でないパッチを選んでから読み込み直す。1件しかなければ確かめられない
    if (patches.length < 2) throw new Error(`/api/patches が2件未満です（${JSON.stringify(patchesBody)}）。BR-04 を実施できません`);

    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try { await runItems(browser, patches); } finally { await browser.close(); }
    await runBlockedStorageItem(patches);
  } finally {
    server.kill();
  }

  const ids = Array.from(new Set(results.map((r) => r.id))).sort();
  const ng = ids.filter((id) => results.some((r) => r.id === id && !r.ok));
  console.log(`\n項目 ${ids.length}件（確認 ${results.length}件）: 合格 ${ids.length - ng.length}件、不合格 ${ng.length}件${ng.length ? `（${ng.join('・')}）` : ''}`);
  // 項目が途中で減っても気づけるように、実施した項目の数も確かめる
  const expectedIds = ['BR-01', 'BR-02', 'BR-03', 'BR-04', 'BR-05', 'BR-06', 'BR-07'];
  if (!isDeepStrictEqual(ids, expectedIds)) {
    console.log(`NG   実施した項目が足りません: ${ids.join('・')}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = ng.length ? 1 : 0;
}

main().catch((err) => { console.error(err); process.exitCode = 2; });
