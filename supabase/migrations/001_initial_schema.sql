-- LoL Pick Tool - Initial Schema
-- Supabase SQL Editor で実行してください
-- https://supabase.com/dashboard/project/mnnnvhbtlnzjeustuovy/sql/new

-- 1. champions（チャンピオンマスター）
CREATE TABLE IF NOT EXISTS champions (
  champion_id   INTEGER       PRIMARY KEY,
  champion_key  VARCHAR(50)   NOT NULL UNIQUE,
  champion_name VARCHAR(100)  NOT NULL,
  image_url     TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 2. champion_stats（先出しピック用）
CREATE TABLE IF NOT EXISTS champion_stats (
  id            BIGSERIAL     PRIMARY KEY,
  champion_id   INTEGER       NOT NULL REFERENCES champions(champion_id),
  lane          VARCHAR(5)    NOT NULL,
  patch         VARCHAR(20)   NOT NULL,
  region        VARCHAR(10)   NOT NULL,
  rank_tier     VARCHAR(20)   NOT NULL,
  games_played  INTEGER       NOT NULL DEFAULT 0,
  wins          INTEGER       NOT NULL DEFAULT 0,
  win_rate      DECIMAL(5,4)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (champion_id, lane, patch, region, rank_tier)
);
CREATE INDEX IF NOT EXISTS idx_stats_filter ON champion_stats (lane, patch, region, rank_tier);

-- 3. counter_stats（カウンターピック用）
CREATE TABLE IF NOT EXISTS counter_stats (
  id                BIGSERIAL     PRIMARY KEY,
  champion_id       INTEGER       NOT NULL REFERENCES champions(champion_id),
  enemy_champion_id INTEGER       NOT NULL REFERENCES champions(champion_id),
  lane              VARCHAR(5)    NOT NULL,
  patch             VARCHAR(20)   NOT NULL,
  region            VARCHAR(10)   NOT NULL,
  rank_tier         VARCHAR(20)   NOT NULL,
  games_played      INTEGER       NOT NULL DEFAULT 0,
  wins              INTEGER       NOT NULL DEFAULT 0,
  win_rate          DECIMAL(5,4)  NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (champion_id, enemy_champion_id, lane, patch, region, rank_tier)
);
CREATE INDEX IF NOT EXISTS idx_counter_enemy ON counter_stats (enemy_champion_id, lane, patch, region, rank_tier);

-- 4. item_build_stats（ビルド統計）
CREATE TABLE IF NOT EXISTS item_build_stats (
  id            BIGSERIAL     PRIMARY KEY,
  champion_id   INTEGER       NOT NULL REFERENCES champions(champion_id),
  lane          VARCHAR(5)    NOT NULL,
  patch         VARCHAR(20)   NOT NULL,
  region        VARCHAR(10)   NOT NULL,
  rank_tier     VARCHAR(20)   NOT NULL,
  item_ids      TEXT          NOT NULL,
  games_played  INTEGER       NOT NULL DEFAULT 0,
  wins          INTEGER       NOT NULL DEFAULT 0,
  win_rate      DECIMAL(5,4)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (champion_id, lane, patch, region, rank_tier, item_ids)
);
CREATE INDEX IF NOT EXISTS idx_item_filter ON item_build_stats (champion_id, lane, patch, region, rank_tier);

-- 5. collection_logs（バッチ実行ログ）
CREATE TABLE IF NOT EXISTS collection_logs (
  id                 BIGSERIAL    PRIMARY KEY,
  patch              VARCHAR(20)  NOT NULL,
  region             VARCHAR(10)  NOT NULL,
  rank_tier          VARCHAR(20)  NOT NULL,
  status             VARCHAR(20)  NOT NULL,
  matches_collected  INTEGER,
  started_at         TIMESTAMPTZ  NOT NULL,
  completed_at       TIMESTAMPTZ,
  error_message      TEXT
);

-- RLS は無効（個人利用のため）
-- 全テーブルで SELECT は anon キーで可能・INSERT/UPDATE/DELETE は service_role キーのみ
