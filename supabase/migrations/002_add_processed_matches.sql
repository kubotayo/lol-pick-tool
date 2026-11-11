-- LoL Pick Tool - processed_matches テーブル追加（DB設計 v1.2.0）
-- Supabase SQL Editor で実行してください
-- https://supabase.com/dashboard/project/mnnnvhbtlnzjeustuovy/sql/new

-- 6. processed_matches（処理済み試合ID管理）
-- スノーボール方式で同じ試合を二重に集計しないよう、バッチ実行をまたいで処理済みIDを記録する
CREATE TABLE IF NOT EXISTS processed_matches (
  match_id      VARCHAR(30)   PRIMARY KEY,
  patch         VARCHAR(20)   NOT NULL,
  processed_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
-- パッチ別の処理済みID取得・古いパッチのクリーンアップ用
CREATE INDEX IF NOT EXISTS idx_processed_patch ON processed_matches (patch);

-- RLS は無効（個人利用のため）
-- SELECT は anon キーで可能・INSERT/UPDATE/DELETE は service_role キーのみ
