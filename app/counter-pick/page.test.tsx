// カウンターピック画面（SCR-03/04）の、絞り込み条件の保存（01 FR-08、03 の 5章）のテスト
// テスト名の先頭の ID は docs/07_ui-test-spec.html の項目 ID と対応する
// 期待結果は設計書（01 FR-08・FR-13、03 の 5章、05 の 3章・4章）から決めている。実装のコードからは決めていない
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

function installFetchMock(): void {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = toUrl(input);
    calls.push(url);
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
function expectNoErrorShown(): void {
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.body.textContent ?? '').not.toMatch(/エラー|失敗|できません|error|failed/i);
}

beforeEach(() => {
  localStorage.clear();
  installFetchMock();
});

afterEach(() => {
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
