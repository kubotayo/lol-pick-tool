import { sleep, is429Error } from './utils';
import type { MatchDto, LeagueEntryDto } from './types';

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
      if (err instanceof Error && err.message.includes('403')) {
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

  // 共通 GET メソッド（レート制限の sleep を内包）
  private async get<T>(url: string): Promise<T> {
    await sleep(RATE_LIMIT_INTERVAL_MS);

    const res = await fetch(url, {
      headers: { 'X-Riot-Token': this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Riot API エラー: ${res.status} ${res.statusText} [${url}]`);
    }

    return res.json() as Promise<T>;
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
