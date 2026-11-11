// バッチスクリプト専用の型定義（Riot API レスポンス・集計中間データ）
// フロントエンドからはインポートしないこと

// -------------------------------------------------------
// Riot MATCH-V5 API レスポンス型
// https://developer.riotgames.com/apis#match-v5/GET_getMatch
// -------------------------------------------------------

export interface MatchDto {
  metadata: MatchMetadataDto;
  info:     MatchInfoDto;
}

export interface MatchMetadataDto {
  matchId:      string;
  participants: string[]; // PUUID リスト
}

export interface MatchInfoDto {
  gameVersion:  string;        // 例: "14.21.619.9898"
  participants: ParticipantDto[];
}

export interface ParticipantDto {
  puuid:        string;
  championId:   number;
  championName: string;
  teamPosition: string; // "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | ""
  teamId:       number; // 100 or 200
  win:          boolean;
  item0:        number;
  item1:        number;
  item2:        number;
  item3:        number;
  item4:        number;
  item5:        number;
  item6:        number; // トリンケット
  gameEndedInEarlySurrender: boolean; // リメイク（開始直後の降参）で終わった試合なら true（参加者全員で同じ値）
}

// -------------------------------------------------------
// Riot LEAGUE-V4 API レスポンス型
// https://developer.riotgames.com/apis#league-v4
// -------------------------------------------------------

export interface LeagueEntryDto {
  summonerId: string;
  puuid:      string;
  leagueId:   string;
  tier:       string;
  rank:       string;
  leaguePoints: number;
  wins:       number;
  losses:     number;
}

// Master 以上のリーグ（/challengerleagues・/grandmasterleagues・/masterleagues）
// tier はリーグ単位で1つ。entries の rank は常に "I"
export interface LeagueListDto {
  tier:    string;
  entries: Array<{ puuid: string; rank: string; leaguePoints: number }>;
}

// -------------------------------------------------------
// バッチ内部で使う集計中間データ型
// メモリ上での集計に使用し、DBには保存しない
// -------------------------------------------------------

// champion_stats / counter_stats / item_build_stats の集計キー
export interface AggregationKey {
  championId:      number;
  lane:            string;
  patch:           string;
  region:          string;
  rankTier:        string;
  enemyChampionId?: number; // counter_stats 専用
  itemIds?:         string;  // item_build_stats 専用
}

// 集計カウンター
export interface AggregationValue {
  gamesPlayed: number;
  wins:        number;
}
