// カウンターピック画面（SCR-03/04）の、絞り込み条件の保存（01 FR-08、03 の 5章）のテスト
// テスト名の先頭の ID は docs/07_ui-test-spec.html の項目 ID と対応する
// 期待結果は設計書（01 FR-08・FR-13、03 の 5章、05 の 3章・4章）から決めている。実装のコードからは決めていない
// （FR-08 の項目についての記述。03 の 6章の項目〔FP-16 以降・CP-17 以降〕は、実装と同じ作業の中で、03 の 6章から作った。07 の 2.1）
//
// 画面の部品の探し方（設計書に DOM の決まりがないため、07 の 8章 T-3 の仮決めに従う）:
// - レーン: 表示の文字がレーン名（TOP など）と一致する button（または role="tab"）
// - リージョン・ランク帯・パッチ: option の value に許可値（パッチは /api/patches の値）を持つ select
// - 相手チャンピオン: チャンピオン名を alt・title・文字のどれかに持つ要素（button の中にあれば、その button）
// - 検索の入力欄: 画面にただ1つの文字の入力欄
// - 選ばれている値: select は value、レーンは /api/champions・/api/counter の lane パラメーターで判定する
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FirstPickPage from '../first-pick/page';
import CounterPickPage from './page';

// next/image は jsdom では最適化の仕組みが動かないため、ただの img に差し替える
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, className, title }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === 'string' ? src : ''}
      alt={typeof alt === 'string' ? alt : ''}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      className={typeof className === 'string' ? className : undefined}
      title={typeof title === 'string' ? title : undefined}
    />
  ),
}));

// next/link・next/navigation は App Router の外では動かないため差し替える（AppHeader が使う）
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/counter-pick',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const KEY = 'lol-pick-tool:filters';

// /api/patches の応答（05 の 5章: 新しい順）。先頭が最新
const PATCHES = ['16.23', '16.22', '16.21'];
const LATEST_PATCH = '16.23';

// /api/champions の応答（05 の 3章の形）
const CHAMPION_ROWS = [
  {
    win_rate: 0.574,
    games_played: 9821,
    champions: {
      champion_id: 58,
      champion_name: 'レネクトン',
      champion_key: 'Renekton',
      image_url: 'https://ddragon.leagueoflegends.com/cdn/16.23.1/img/champion/Renekton.png',
    },
  },
  {
    win_rate: 0.521,
    games_played: 4410,
    champions: {
      champion_id: 86,
      champion_name: 'ガレン',
      champion_key: 'Garen',
      image_url: 'https://ddragon.leagueoflegends.com/cdn/16.23.1/img/champion/Garen.png',
    },
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function toUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, 'http://localhost');
  if (input instanceof URL) return input;
  return new URL(input.url, 'http://localhost');
}

// 呼ばれた URL を順に記録する
let calls: URL[] = [];

// 項目ごとに応答を差し替える（undefined を返した URL は、下の正常な応答になる）。失敗を表すには例外を投げる
type FetchOverride = (url: URL) => Response | undefined;

function installFetchMock(override?: FetchOverride): void {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = toUrl(input);
    calls.push(url);
    const overridden = override?.(url);
    if (overridden) return overridden;
    if (url.pathname === '/api/patches') return jsonResponse(PATCHES);
    if (url.pathname === '/api/champions') return jsonResponse(CHAMPION_ROWS);
    if (url.pathname === '/api/counter') return jsonResponse(CHAMPION_ROWS);
    return jsonResponse({ error: 'Not Found' }, 404);
  }));
}

function callsTo(pathname: string): URL[] {
  return calls.filter((url) => url.pathname === pathname);
}

interface RequestedFilters {
  lane: string | null;
  patch: string | null;
  region: string;
  tier: string;
}

// API に届く絞り込み条件。region・tier は省略すると API の既定値（05 の 3章: JP・platinum_plus）になるため、省略は既定値として読む
function requestedFilters(url: URL): RequestedFilters {
  return {
    lane: url.searchParams.get('lane'),
    patch: url.searchParams.get('patch'),
    region: url.searchParams.get('region') ?? 'JP',
    tier: url.searchParams.get('tier') ?? 'platinum_plus',
  };
}

// 遅れて来る余分な呼び出しを待つ（「1回だけ」を確かめるため。待たずに数えると、2回目が来る前に合格してしまう）
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

// /api/champions が count 回以上呼ばれるまで待ち、その後に余分な呼び出しが来ないか待ってから返す
async function waitForChampionsCalls(count: number): Promise<URL[]> {
  await waitFor(() => {
    expect(callsTo('/api/champions').length).toBeGreaterThanOrEqual(count);
  });
  await settle();
  return callsTo('/api/champions');
}

function findSelectWithOption(value: string): HTMLSelectElement {
  const selects = Array.from(document.querySelectorAll('select'));
  const found = selects.filter((select) => Array.from(select.options).some((option) => option.value === value));
  if (found.length !== 1) {
    throw new Error(`option の value が ${value} の select が ${found.length} 個ある（1個のはず）`);
  }
  return found[0];
}

const regionSelect = (): HTMLSelectElement => findSelectWithOption('KR');
const tierSelect = (): HTMLSelectElement => findSelectWithOption('master_plus');
const patchSelect = (): HTMLSelectElement => findSelectWithOption('16.22');

function laneTab(lane: string): HTMLElement {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="tab"]'));
  const found = candidates.filter((element) => element.textContent?.trim() === lane);
  if (found.length !== 1) {
    throw new Error(`表示が ${lane} のレーンのボタンが ${found.length} 個ある（1個のはず）`);
  }
  return found[0];
}

function storedValue(): unknown {
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

function seed(value: unknown): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

// localStorage を参照しただけで例外になる状態を作る（サイトのデータの保存を禁止した Chrome と同じ動き）
function blockLocalStorageAccess(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  };
}

// 画面にエラーの表示がないこと（03 の 5.3「画面にエラーを表示しない」）
// 画面の外に漏れた例外（イベントハンドラや effect の中で投げられ、誰にも捕まえられなかったもの）
const uncaughtErrors: unknown[] = [];
const recordUncaughtError = (event: ErrorEvent): void => {
  uncaughtErrors.push(event.error ?? event.message);
  event.preventDefault();
};

function expectNoErrorShown(): void {
  // 例外が漏れていないこと（保存の失敗を握りつぶさずに投げると、ここで NG になる）
  expect(uncaughtErrors).toStrictEqual([]);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.body.textContent ?? '').not.toMatch(/エラー|失敗|できません|error|failed/i);
}

beforeEach(() => {
  uncaughtErrors.length = 0;
  window.addEventListener('error', recordUncaughtError);
  localStorage.clear();
  installFetchMock();
});

afterEach(() => {
  window.removeEventListener('error', recordUncaughtError);
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// 相手チャンピオン（CHAMPION_ROWS の2体目）
const ENEMY_NAME = 'ガレン';
const ENEMY_ID = '86';

// 相手チャンピオンの一覧から、名前で1体を探す。button の中にあれば、その button を返す
async function findEnemyChampion(name: string): Promise<HTMLElement> {
  let found: HTMLElement[] = [];
  await waitFor(() => {
    found = [
      ...screen.queryAllByAltText(name),
      ...screen.queryAllByTitle(name),
      ...screen.queryAllByText(name),
    ];
    expect(found.length).toBeGreaterThanOrEqual(1);
  });
  const target = found[0];
  return target.closest<HTMLElement>('button, [role="button"], [role="option"]') ?? target;
}

function searchBox(): HTMLInputElement {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="search"], input:not([type])'),
  );
  if (inputs.length !== 1) {
    throw new Error(`文字の入力欄が ${inputs.length} 個ある（検索の1個のはず）`);
  }
  return inputs[0];
}

// /api/counter が count 回以上呼ばれるまで待ち、その後に余分な呼び出しが来ないか待ってから返す
async function waitForCounterCalls(count: number): Promise<URL[]> {
  await waitFor(() => {
    expect(callsTo('/api/counter').length).toBeGreaterThanOrEqual(count);
  });
  await settle();
  return callsTo('/api/counter');
}

describe('カウンターピック画面: 絞り込み条件の保存', () => {
  describe('画面を開いたとき', () => {
    it('CP-01 保存値がなければ、既定値（TOP・JP・platinum_plus）と最新のパッチで /api/champions を1回だけ呼び、/api/counter は呼ばず、保存はしない', async () => {
      render(<CounterPickPage />);

      const championsCalls = await waitForChampionsCalls(1);

      expect(championsCalls).toHaveLength(1);
      expect(requestedFilters(championsCalls[0])).toStrictEqual({
        lane: 'TOP', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
      });
      expect(regionSelect().value).toBe('JP');
      expect(tierSelect().value).toBe('platinum_plus');
      expect(patchSelect().value).toBe(LATEST_PATCH);
      // 相手チャンピオンは未選択で始まる（03 の 5.1）ので、カウンターの取得はまだ起きない
      expect(callsTo('/api/counter')).toHaveLength(0);
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('CP-02 保存値があれば、保存値と最新のパッチで /api/champions を1回だけ呼ぶ（既定値では呼ばない）。/api/counter は呼ばない', async () => {
      seed({ v: 1, lane: 'MID', region: 'KR', tier: 'master_plus' });

      render(<CounterPickPage />);

      const championsCalls = await waitForChampionsCalls(1);

      expect(championsCalls).toHaveLength(1);
      expect(requestedFilters(championsCalls[0])).toStrictEqual({
        lane: 'MID', patch: LATEST_PATCH, region: 'KR', tier: 'master_plus',
      });
      // 既定値（TOP・JP・platinum_plus）での呼び出しが1つもない
      expect(championsCalls.filter((url) => url.searchParams.get('lane') === 'TOP')).toHaveLength(0);
      expect(championsCalls.filter((url) => requestedFilters(url).region === 'JP')).toHaveLength(0);
      expect(championsCalls.filter((url) => requestedFilters(url).tier === 'platinum_plus')).toHaveLength(0);
      expect(regionSelect().value).toBe('KR');
      expect(tierSelect().value).toBe('master_plus');
      expect(patchSelect().value).toBe(LATEST_PATCH);
      expect(callsTo('/api/counter')).toHaveLength(0);
    });

    it('CP-03 保存値があるとき、相手チャンピオンを選ぶと、保存値と最新のパッチで /api/counter を1回だけ呼ぶ', async () => {
      seed({ v: 1, lane: 'MID', region: 'KR', tier: 'master_plus' });
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);

      fireEvent.click(await findEnemyChampion(ENEMY_NAME));

      const counterCalls = await waitForCounterCalls(1);
      expect(counterCalls).toHaveLength(1);
      expect(counterCalls[0].searchParams.get('enemy_champion_id')).toBe(ENEMY_ID);
      expect(requestedFilters(counterCalls[0])).toStrictEqual({
        lane: 'MID', patch: LATEST_PATCH, region: 'KR', tier: 'master_plus',
      });
    });

    it('CP-04 保存値のレーンだけが許可値にないとき、レーンだけ既定値（TOP）で、ほかは保存値で1回だけ呼ぶ。保存値は書き換えない', async () => {
      const raw = '{"v":1,"lane":"ADC","region":"KR","tier":"diamond_plus"}';
      localStorage.setItem(KEY, raw);

      render(<CounterPickPage />);

      const championsCalls = await waitForChampionsCalls(1);

      expect(championsCalls).toHaveLength(1);
      expect(requestedFilters(championsCalls[0])).toStrictEqual({
        lane: 'TOP', patch: LATEST_PATCH, region: 'KR', tier: 'diamond_plus',
      });
      expect(regionSelect().value).toBe('KR');
      expect(tierSelect().value).toBe('diamond_plus');
      expect(patchSelect().value).toBe(LATEST_PATCH);
      expect(localStorage.getItem(KEY)).toBe(raw);
    });

    it.each([
      ['JSON として読めない', 'not json'],
      ['v が 2', '{"v":2,"lane":"MID","region":"KR","tier":"diamond_plus"}'],
      ['オブジェクトでない', '"MID"'],
    ])('CP-05 保存値の全体が使えない（%s）とき、3項目とも既定値で1回だけ呼び、エラーを表示しない', async (_label, raw) => {
      localStorage.setItem(KEY, raw);

      render(<CounterPickPage />);

      const championsCalls = await waitForChampionsCalls(1);

      expect(championsCalls).toHaveLength(1);
      expect(requestedFilters(championsCalls[0])).toStrictEqual({
        lane: 'TOP', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
      });
      expectNoErrorShown();
    });

    it('CP-06 保存値に patch が入っていても使わず、最新のパッチを選ぶ', async () => {
      seed({ v: 1, lane: 'MID', region: 'KR', tier: 'master_plus', patch: '16.21' });

      render(<CounterPickPage />);

      const championsCalls = await waitForChampionsCalls(1);

      expect(championsCalls).toHaveLength(1);
      expect(championsCalls[0].searchParams.get('patch')).toBe(LATEST_PATCH);
      expect(patchSelect().value).toBe(LATEST_PATCH);
    });
  });

  describe('絞り込み条件を変えたとき', () => {
    it('CP-07 レーンを変えると、そのとき選ばれている3項目を保存し、変えた後の値で呼び直す', async () => {
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);

      fireEvent.click(laneTab('BOT'));

      const championsCalls = await waitForChampionsCalls(2);
      expect(championsCalls).toHaveLength(2);
      expect(requestedFilters(championsCalls[1])).toStrictEqual({
        lane: 'BOT', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
      });
      expect(storedValue()).toStrictEqual({ v: 1, lane: 'BOT', region: 'JP', tier: 'platinum_plus' });
    });

    it('CP-08 ランク帯を変えると、保存値から読み込んだほかの2項目と一緒に保存する', async () => {
      seed({ v: 1, lane: 'MID', region: 'KR', tier: 'master_plus' });
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);

      fireEvent.change(tierSelect(), { target: { value: 'all' } });

      const championsCalls = await waitForChampionsCalls(2);
      expect(championsCalls).toHaveLength(2);
      expect(requestedFilters(championsCalls[1])).toStrictEqual({
        lane: 'MID', patch: LATEST_PATCH, region: 'KR', tier: 'all',
      });
      expect(storedValue()).toStrictEqual({ v: 1, lane: 'MID', region: 'KR', tier: 'all' });
    });

    it('CP-09 リージョンを変えると、そのとき選ばれている3項目を保存する', async () => {
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);

      fireEvent.change(regionSelect(), { target: { value: 'NA' } });

      const championsCalls = await waitForChampionsCalls(2);
      expect(championsCalls).toHaveLength(2);
      expect(requestedFilters(championsCalls[1])).toStrictEqual({
        lane: 'TOP', patch: LATEST_PATCH, region: 'NA', tier: 'platinum_plus',
      });
      expect(storedValue()).toStrictEqual({ v: 1, lane: 'TOP', region: 'NA', tier: 'platinum_plus' });
    });

    it('CP-10 パッチを変えても保存しない（選んだパッチでは呼び直す）', async () => {
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);

      fireEvent.change(patchSelect(), { target: { value: '16.22' } });

      const championsCalls = await waitForChampionsCalls(2);
      expect(championsCalls).toHaveLength(2);
      expect(requestedFilters(championsCalls[1])).toStrictEqual({
        lane: 'TOP', patch: '16.22', region: 'JP', tier: 'platinum_plus',
      });
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('相手チャンピオン・検索の文字は覚えない', () => {
    it('CP-11 検索に文字を入れ、相手チャンピオンを選んでも、保存しない', async () => {
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);

      fireEvent.change(searchBox(), { target: { value: 'ガ' } });
      fireEvent.click(await findEnemyChampion(ENEMY_NAME));
      await waitForCounterCalls(1);

      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('CP-12 相手チャンピオンを選んだ後にレーンを変えても、保存値は v と3項目だけ', async () => {
      render(<CounterPickPage />);
      await waitForChampionsCalls(1);
      fireEvent.change(searchBox(), { target: { value: 'ガ' } });
      fireEvent.click(await findEnemyChampion(ENEMY_NAME));
      await waitForCounterCalls(1);

      fireEvent.click(laneTab('JG'));
      await waitForChampionsCalls(2);

      // toStrictEqual なので、相手チャンピオン・検索の文字・パッチなどの余分なプロパティがあれば NG になる
      expect(storedValue()).toStrictEqual({ v: 1, lane: 'JG', region: 'JP', tier: 'platinum_plus' });
    });

    it('CP-13 画面を作り直すと、相手チャンピオンは未選択（/api/counter を呼ばない）、検索は空で始まる', async () => {
      const first = render(<CounterPickPage />);
      await waitForChampionsCalls(1);
      fireEvent.click(laneTab('MID'));
      await waitForChampionsCalls(2);
      fireEvent.change(searchBox(), { target: { value: 'ガ' } });
      fireEvent.click(await findEnemyChampion(ENEMY_NAME));
      await waitForCounterCalls(1);
      first.unmount();
      calls = [];

      render(<CounterPickPage />);

      const championsCalls = await waitForChampionsCalls(1);
      // レーンは覚えている（作り直しが効いていることの確認）
      expect(championsCalls).toHaveLength(1);
      expect(championsCalls[0].searchParams.get('lane')).toBe('MID');
      expect(callsTo('/api/counter')).toHaveLength(0);
      expect(searchBox().value).toBe('');
    });
  });

  describe('先出しピックとの共有', () => {
    it('CP-14 カウンターピックで変えた3項目で、先出しピックが /api/champions を1回だけ呼ぶ（先出しピックの既定の MID では呼ばない）', async () => {
      const first = render(<CounterPickPage />);
      await waitForChampionsCalls(1);
      fireEvent.click(laneTab('SUP'));
      await waitForChampionsCalls(2);
      fireEvent.change(regionSelect(), { target: { value: 'EUW' } });
      await waitForChampionsCalls(3);
      fireEvent.change(tierSelect(), { target: { value: 'diamond_plus' } });
      await waitForChampionsCalls(4);
      first.unmount();
      calls = [];

      render(<FirstPickPage />);

      const championsCalls = await waitForChampionsCalls(1);
      expect(championsCalls).toHaveLength(1);
      expect(requestedFilters(championsCalls[0])).toStrictEqual({
        lane: 'SUP', patch: LATEST_PATCH, region: 'EUW', tier: 'diamond_plus',
      });
      expect(regionSelect().value).toBe('EUW');
      expect(tierSelect().value).toBe('diamond_plus');
      expect(patchSelect().value).toBe(LATEST_PATCH);
    });
  });

  describe('localStorage が使えないとき', () => {
    it('CP-15 読み書きが例外を投げても、既定値で1回だけ呼び、レーンを変えて相手チャンピオンを選べ、エラーを表示しない', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      });

      render(<CounterPickPage />);

      const opened = await waitForChampionsCalls(1);
      expect(opened).toHaveLength(1);
      expect(requestedFilters(opened[0])).toStrictEqual({
        lane: 'TOP', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
      });

      fireEvent.click(laneTab('JG'));

      const changed = await waitForChampionsCalls(2);
      expect(changed).toHaveLength(2);
      expect(requestedFilters(changed[1])).toStrictEqual({
        lane: 'JG', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
      });

      fireEvent.click(await findEnemyChampion(ENEMY_NAME));

      const counterCalls = await waitForCounterCalls(1);
      expect(counterCalls).toHaveLength(1);
      expect(counterCalls[0].searchParams.get('enemy_champion_id')).toBe(ENEMY_ID);
      expect(requestedFilters(counterCalls[0])).toStrictEqual({
        lane: 'JG', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
      });
      expectNoErrorShown();
      // 例外の経路を実際に通ったことを確かめる（読み書きを試みずに動いただけでは合格にしない）
      expect(getItem).toHaveBeenCalled();
      expect(setItem).toHaveBeenCalled();
    });

    it('CP-16 localStorage の参照そのものが例外を投げても、既定値で1回だけ呼び、リージョンを変えられ、エラーを表示しない', async () => {
      const restore = blockLocalStorageAccess();
      try {
        // 前提: この状態で localStorage を参照すると例外になる
        expect(() => window.localStorage).toThrow();

        render(<CounterPickPage />);

        const opened = await waitForChampionsCalls(1);
        expect(opened).toHaveLength(1);
        expect(requestedFilters(opened[0])).toStrictEqual({
          lane: 'TOP', patch: LATEST_PATCH, region: 'JP', tier: 'platinum_plus',
        });

        fireEvent.change(regionSelect(), { target: { value: 'KR' } });

        const changed = await waitForChampionsCalls(2);
        expect(changed).toHaveLength(2);
        expect(requestedFilters(changed[1])).toStrictEqual({
          lane: 'TOP', patch: LATEST_PATCH, region: 'KR', tier: 'platinum_plus',
        });
        expect(regionSelect().value).toBe('KR');
        expectNoErrorShown();
      } finally {
        restore();
      }
    });
  });
});

// 画面に出す文言（03 の 6章）
const PATCHES_ERROR_MESSAGE = 'パッチの一覧を取得できませんでした。ページを読み込み直してください。';
const PATCHES_EMPTY_MESSAGE = '表示できるパッチがありません。';
const DATA_ERROR_MESSAGE = 'データを取得できませんでした。ページを読み込み直してください。';

// パッチの select（フィルターバーの3つ目。パッチの一覧が空のときは option の値で探せないため、並び順で探す）
function patchOptionCount(): number {
  const selects = Array.from(document.querySelectorAll('select'));
  if (selects.length !== 3) throw new Error(`select が ${selects.length} 個ある（3個のはず）`);
  return selects[2].options.length;
}

// 取得できないときの文言の色（03 の 6.1: #f87171）。jsdom は rgb() の形で返す
const ERROR_COLOR = 'rgb(248, 113, 113)';

function alertColors(): string[] {
  return screen.queryAllByRole('alert').map((element) => element.style.color);
}

// テストが決めた時点で応答を返す fetch（応答の前の表示を確かめるため）
function installDeferredMock(pathname: string): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = toUrl(input);
    calls.push(url);
    if (url.pathname === pathname) await gate;
    if (url.pathname === '/api/patches') return jsonResponse(PATCHES);
    return jsonResponse(CHAMPION_ROWS);
  }));
  return release;
}

function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((element) => element.textContent ?? '');
}

describe('カウンターピック画面: API から取得できないとき（03 の 6章）', () => {
  it.each([
    ['500 の応答', (): Response => jsonResponse({ error: 'Internal Server Error' }, 500)],
    ['本文が配列の 500 の応答', (): Response => jsonResponse(['16.23'], 500)],
    ['配列でない 200 の応答', (): Response => jsonResponse({ error: 'unexpected' })],
    ['通信の失敗', (): Response => { throw new TypeError('Failed to fetch'); }],
  ])('CP-17 /api/patches が%sのとき、パッチの取得失敗の文言を表示し、/api/champions を呼ばない', async (_name, respond) => {
    installFetchMock((url) => (url.pathname === '/api/patches' ? respond() : undefined));

    render(<CounterPickPage />);

    await waitFor(() => { expect(alertTexts()).toStrictEqual([PATCHES_ERROR_MESSAGE]); });
    await settle();
    expect(alertTexts()).toStrictEqual([PATCHES_ERROR_MESSAGE]);
    expect(callsTo('/api/champions')).toHaveLength(0);
    expect(alertColors()).toStrictEqual([ERROR_COLOR]);
    expect(patchOptionCount()).toBe(0);
    // 自動で再試行しない
    expect(callsTo('/api/patches')).toHaveLength(1);
    expect(callsTo('/api/counter')).toHaveLength(0);
    expect(document.body.textContent ?? '').not.toContain('読み込み中');
    expect(uncaughtErrors).toStrictEqual([]);
  });

  it('CP-18 /api/patches が空の配列のとき、パッチがない文言を表示し、エラーの表示は出さず、/api/champions を呼ばない', async () => {
    installFetchMock((url) => (url.pathname === '/api/patches' ? jsonResponse([]) : undefined));

    render(<CounterPickPage />);

    expect(await screen.findByText(PATCHES_EMPTY_MESSAGE)).toBeTruthy();
    await settle();
    expect(alertTexts()).toStrictEqual([]);
    expect(callsTo('/api/champions')).toHaveLength(0);
    expect(patchOptionCount()).toBe(0);
    expect(callsTo('/api/patches')).toHaveLength(1);
    expect(document.body.textContent ?? '').not.toContain('読み込み中');
    expect(uncaughtErrors).toStrictEqual([]);
  });

  it('CP-19 /api/champions が 500 のとき、データの取得失敗の文言を表示する。条件を変えて取得できれば、文言が消えて相手チャンピオンを選べる', async () => {
    // TOP（既定値）のときだけ失敗させる
    installFetchMock((url) => (
      url.pathname === '/api/champions' && url.searchParams.get('lane') === 'TOP'
        ? jsonResponse({ error: 'Internal Server Error' }, 500)
        : undefined
    ));

    render(<CounterPickPage />);

    await waitFor(() => { expect(alertTexts()).toStrictEqual([DATA_ERROR_MESSAGE]); });
    expect(document.body.textContent ?? '').not.toContain('読み込み中');

    fireEvent.click(laneTab('JG'));

    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    const counterCalls = await waitForCounterCalls(1);
    expect(counterCalls).toHaveLength(1);
    expect(alertTexts()).toStrictEqual([]);
    expect(uncaughtErrors).toStrictEqual([]);
  });

  it.each([
    ['500 の応答', (): Response => jsonResponse({ error: 'Internal Server Error' }, 500)],
    ['通信の失敗', (): Response => { throw new TypeError('Failed to fetch'); }],
  ])('CP-20 /api/counter が%sのとき、データの取得失敗の文言を表示し、「データが不足しています」とは表示しない', async (_name, respond) => {
    installFetchMock((url) => (url.pathname === '/api/counter' ? respond() : undefined));

    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));

    await waitFor(() => { expect(alertTexts()).toStrictEqual([DATA_ERROR_MESSAGE]); });
    await settle();
    expect(document.body.textContent ?? '').not.toContain('データが不足しています');
    expect(document.body.textContent ?? '').not.toContain('読み込み中');
    expect(uncaughtErrors).toStrictEqual([]);
  });

  it('CP-21 相手チャンピオンを選んだ後に絞り込み条件を変えると、選択が外れ、変えた後の条件では /api/counter を呼ばない', async () => {
    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    expect(await waitForCounterCalls(1)).toHaveLength(1);

    fireEvent.click(laneTab('JG'));

    await waitForChampionsCalls(2);
    expect(await screen.findByText('← 相手チャンピオンを選択してください')).toBeTruthy();
    expect(callsTo('/api/counter')).toHaveLength(1);
  });
});

describe('カウンターピック画面: 応答を待っているあいだ・選択の解除（03 の 6.1）', () => {
  it('CP-22 /api/patches の応答の前は「読み込み中...」を表示し、/api/champions を呼ばない。応答の後は相手チャンピオンの一覧を表示し、「読み込み中...」を消す', async () => {
    const release = installDeferredMock('/api/patches');

    render(<CounterPickPage />);
    await settle();

    expect(screen.getAllByText('読み込み中...')).toHaveLength(1);
    expect(callsTo('/api/champions')).toHaveLength(0);

    await act(async () => { release(); });

    await findEnemyChampion(ENEMY_NAME);
    expect(screen.queryByText('読み込み中...')).toBeNull();
  });

  it('CP-26 /api/counter の応答の前は「読み込み中...」を表示し、「データが不足しています」は表示しない', async () => {
    const release = installDeferredMock('/api/counter');

    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    await waitFor(() => { expect(callsTo('/api/counter')).toHaveLength(1); });
    await settle();

    expect(screen.getAllByText('読み込み中...')).toHaveLength(1);
    expect(document.body.textContent ?? '').not.toContain('データが不足しています');

    await act(async () => { release(); });

    await waitFor(() => { expect(screen.queryByText('読み込み中...')).toBeNull(); });
  });

  it('CP-27 /api/champions の応答の前は「読み込み中...」を表示する。応答の後は消す', async () => {
    const release = installDeferredMock('/api/champions');

    render(<CounterPickPage />);
    await waitFor(() => { expect(callsTo('/api/champions')).toHaveLength(1); });
    await settle();

    expect(screen.getAllByText('読み込み中...')).toHaveLength(1);

    await act(async () => { release(); });

    await findEnemyChampion(ENEMY_NAME);
    expect(screen.queryByText('読み込み中...')).toBeNull();
  });

  it('CP-23 相手チャンピオンを選び、レーンを変えてから元のレーンに戻しても、選択は外れたままで、/api/counter を呼び直さない', async () => {
    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    expect(await waitForCounterCalls(1)).toHaveLength(1);

    fireEvent.click(laneTab('JG'));
    await waitForChampionsCalls(2);
    fireEvent.click(laneTab('TOP'));
    await waitForChampionsCalls(3);

    expect(await screen.findByText('← 相手チャンピオンを選択してください')).toBeTruthy();
    expect(callsTo('/api/counter')).toHaveLength(1);
  });

  it.each([
    ['リージョン', (): void => { fireEvent.change(regionSelect(), { target: { value: 'KR' } }); }, (): void => { fireEvent.change(regionSelect(), { target: { value: 'JP' } }); }],
    ['ランク帯', (): void => { fireEvent.change(tierSelect(), { target: { value: 'master_plus' } }); }, (): void => { fireEvent.change(tierSelect(), { target: { value: 'platinum_plus' } }); }],
    ['パッチ', (): void => { fireEvent.change(patchSelect(), { target: { value: '16.22' } }); }, (): void => { fireEvent.change(patchSelect(), { target: { value: '16.23' } }); }],
  ])('CP-24 相手チャンピオンを選び、%sを変えてから元に戻しても、選択は外れたままで、/api/counter を呼び直さない', async (_name, change, restore) => {
    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    expect(await waitForCounterCalls(1)).toHaveLength(1);

    change();
    await waitForChampionsCalls(2);
    restore();
    await waitForChampionsCalls(3);

    expect(await screen.findByText('← 相手チャンピオンを選択してください')).toBeTruthy();
    expect(callsTo('/api/counter')).toHaveLength(1);
  });

  it('CP-28 選ばれているレーンを押し直しても、相手チャンピオンの選択は残り、API を呼び直さない', async () => {
    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    expect(await waitForCounterCalls(1)).toHaveLength(1);

    fireEvent.click(laneTab('TOP'));
    await settle();

    expect(screen.queryByText('← 相手チャンピオンを選択してください')).toBeNull();
    expect(callsTo('/api/champions')).toHaveLength(1);
    expect(callsTo('/api/counter')).toHaveLength(1);
  });

  it('CP-29 相手チャンピオンを選び、レーンを変えて元に戻し、同じ相手を選び直すと、応答の前は「読み込み中...」を表示する（前の結果を出さない）', async () => {
    // /api/counter は、1回目は失敗、2回目はテストが返すまで止める
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let counterCalls = 0;
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrl(input);
      calls.push(url);
      if (url.pathname === '/api/patches') return jsonResponse(PATCHES);
      if (url.pathname === '/api/counter') {
        counterCalls += 1;
        if (counterCalls === 1) return jsonResponse({ error: 'Internal Server Error' }, 500);
        await gate;
      }
      return jsonResponse(CHAMPION_ROWS);
    }));

    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    await waitFor(() => { expect(alertTexts()).toStrictEqual([DATA_ERROR_MESSAGE]); });

    fireEvent.click(laneTab('JG'));
    await waitForChampionsCalls(2);
    fireEvent.click(laneTab('TOP'));
    await waitForChampionsCalls(3);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    await waitFor(() => { expect(callsTo('/api/counter')).toHaveLength(2); });
    await settle();

    expect(alertTexts()).toStrictEqual([]);
    expect(screen.getAllByText('読み込み中...')).toHaveLength(1);

    await act(async () => { release(); });

    await waitFor(() => { expect(screen.queryByText('読み込み中...')).toBeNull(); });
    expect(alertTexts()).toStrictEqual([]);
  });

  it('CP-30 /api/counter が失敗した後に、同じ相手を押し直しても取り直さない。別の相手を押すと取り直す', async () => {
    installFetchMock((url) => (
      url.pathname === '/api/counter' ? jsonResponse({ error: 'Internal Server Error' }, 500) : undefined
    ));

    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    await waitFor(() => { expect(alertTexts()).toStrictEqual([DATA_ERROR_MESSAGE]); });

    fireEvent.click(await findEnemyChampion(ENEMY_NAME));
    await settle();
    expect(callsTo('/api/counter')).toHaveLength(1);

    fireEvent.click(await findEnemyChampion('レネクトン'));
    const counterCalls = await waitForCounterCalls(2);
    expect(counterCalls).toHaveLength(2);
    expect(counterCalls[1].searchParams.get('enemy_champion_id')).toBe('58');
  });

  it('CP-25 /api/counter が失敗したときの文言の色は #f87171', async () => {
    installFetchMock((url) => (
      url.pathname === '/api/counter' ? jsonResponse({ error: 'Internal Server Error' }, 500) : undefined
    ));

    render(<CounterPickPage />);
    fireEvent.click(await findEnemyChampion(ENEMY_NAME));

    await waitFor(() => { expect(alertTexts()).toStrictEqual([DATA_ERROR_MESSAGE]); });
    await settle();
    expect(alertColors()).toStrictEqual([ERROR_COLOR]);
    expect(callsTo('/api/counter')).toHaveLength(1);
  });
});
