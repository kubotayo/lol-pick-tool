// フロントエンド・バッチスクリプト両方で共有するインターフェース定義
// Supabase のテーブル構造に対応させること

export interface Champion {
  champion_id:   number;
  champion_name: string;
  champion_key:  string;
  image_url:     string;
}

// champion_stats テーブルの SELECT 結果（champions テーブルを JOIN）
export interface ChampionStatRow {
  win_rate:     number; // 0〜1 の小数（例: 0.5741 = 57.41%）
  games_played: number;
  champions:    Champion;
}

// counter_stats テーブルの SELECT 結果（champions テーブルを JOIN）
export interface CounterStatRow {
  win_rate:     number;
  games_played: number;
  champions:    Champion;
}

// Tier 分類ラベル（FR-06 に準拠: S/A/B/C）
export type Tier_Label = 'S' | 'A' | 'B' | 'C';
