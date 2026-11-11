import { sleep, is429Error, HttpError } from './utils';
import type { MatchDto, LeagueEntryDto, LeagueListDto } from './types';

// Riot API のリージョン別エンドポイント定義
// jp1 は asia ルーティングを使用する
const PLATFORM_TO_ROUTING: Record<string, string> = {
  jp1:   'asia',
  kr:    'asia',
  na1:   'americas',
  euw1:  'europe',
  eune1: 'europe',
};

// レート制限: 100 req/2分 → 1.2秒/req
const RATE_LIMIT_INTERVAL_MS = 1200;
// 429 時のエクスポネンシャルバックオフ初期待機時間
const INITIAL_BACKOFF_MS = 1000;
const MAX_RETRIES = 4;
// 1回の呼び出しの時間切れ（ふだんの応答は 0.1秒ほど）。応答が止まると時間上限の確認に進めず、
// 時間上限を大きく超えるため（システムテスト ST-04 で 17分の上限に対して 31分動いた）
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * エラー文に入れる URL の PUUID を先頭8文字だけにする
 * GitHub Actions のログは公開リポジトリでは誰でも読めるため、プレイヤーの ID をそのまま出さない
 */
export function maskUrl(url: string): string {
  return url.replace(/\/by-puuid\/([^/?]{8})[^/?]*/, '/by-puuid/$1...');
}

export class RiotClient {
  private readonly apiKey: string;
  private readonly platform: string;
  private readonly routing: string;

  constructor(platform: string) {
    const key = process.env.RIOT_API_KEY;
    if (!key) throw new Error('RIOT_API_KEY が設定されていません');

    this.apiKey   = key;
    this.platform = platform;
    this.routing  = PLATFORM_TO_ROUTING[platform];
    if (!this.routing) throw new Error(`不明なプラットフォーム: ${platform}`);
  }

  // APIキーが有効かどうかを事前検証する
  // 失効している場合はバッチ全体を即座に失敗させる（長時間実行後の失敗を防ぐため）
  async validateApiKey(): Promise<void> {
    console.log('[RiotClient] APIキーの有効性を検証中...');
    try {
      await this.get<unknown>(
        `https://${this.platform}.api.riotgames.com/lol/status/v4/platform-data`
      );
      console.log('[RiotClient] APIキー検証OK');
    } catch (err) {
      // 失効したキーは 403、誤ったキーは 401 が返る（システムテスト ST-05 で確認）
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
        throw new Error('Riot APIキーが無効または失効しています。GitHub Secrets を更新してください。');
      }
      throw err;
    }
  }

  // LEAGUE-V4: ランク帯別プレイヤー一覧を取得する（シード用）
  async getLeagueEntries(
    queue: string,
    tier: string,
    division: string,
    page = 1
  ): Promise<LeagueEntryDto[]> {
    const url = `https://${this.platform}.api.riotgames.com/lol/league/v4/entries/${queue}/${tier}/${division}?page=${page}`;
    return this.fetchWithRetry<LeagueEntryDto[]>(() => this.get(url));
  }

  // LEAGUE-V4: Master 以上のリーグを丸ごと取得する（entries エンドポイントは Master 以上に対応していないため）
  async getApexLeague(
    queue: string,
    tier: 'challenger' | 'grandmaster' | 'master'
  ): Promise<LeagueListDto> {
    const url = `https://${this.platform}.api.riotgames.com/lol/league/v4/${tier}leagues/by-queue/${queue}`;
    return this.fetchWithRetry<LeagueListDto>(() => this.get(url));
  }

  // MATCH-V5: プレイヤーの直近試合IDリストを取得する
  async getMatchIds(puuid: string, count = 20): Promise<string[]> {
    const url = `https://${this.routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${count}`;
    return this.fetchWithRetry<string[]>(() => this.get(url));
  }

  // MATCH-V5: 試合詳細を取得する
  async getMatch(matchId: string): Promise<MatchDto> {
    const url = `https://${this.routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    return this.fetchWithRetry<MatchDto>(() => this.get(url));
  }

  // 共通 GET メソッド（レート制限の sleep と時間切れを内包）
  private async get<T>(url: string): Promise<T> {
    await sleep(RATE_LIMIT_INTERVAL_MS);

    // 応答の本文を読み終えるまでを時間切れの対象にする
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'X-Riot-Token': this.apiKey },
        signal:  controller.signal,
      });

      if (!res.ok) {
        throw new HttpError(`Riot API エラー: ${res.status} ${res.statusText} [${maskUrl(url)}]`, res.status);
      }

      return (await res.json()) as T;
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Riot API タイムアウト: ${REQUEST_TIMEOUT_MS / 1000}秒以内に応答がありません [${maskUrl(url)}]`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // 429 のみ自動リトライ、それ以外は即 throw する
  private async fetchWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let backoff = INITIAL_BACKOFF_MS;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!is429Error(err) || attempt === MAX_RETRIES) throw err;

        console.warn(
          `[RiotClient] 429 レート制限 → ${backoff}ms 後にリトライ (${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoff);
        backoff *= 2; // 1s → 2s → 4s → 8s
      }
    }

    throw new Error('unreachable');
  }
}
