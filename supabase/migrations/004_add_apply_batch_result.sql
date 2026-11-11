-- LoL Pick Tool - 集計結果を加算で書き込む関数を追加（DB設計 v1.4.0）
--
-- 1回のバッチ実行の結果（集計3テーブル + 処理済み試合ID）を、1トランザクションで書き込む。
--   - 集計値は既存の行に加算する（上書きすると前回までの集計が消えるため）
--   - win_rate は加算後の games_played / wins から計算し直す
--   - 処理済みの試合が1件でも含まれていたらエラーにして、全体を取り消す（二重加算を防ぐ）
--   - 実行できるのは service_role（バッチ）のみ

CREATE OR REPLACE FUNCTION apply_batch_result(
  p_patch         text,
  p_region        text,
  p_rank_tier     text,
  p_champion_rows jsonb,   -- [{champion_id, lane, games_played, wins}]
  p_counter_rows  jsonb,   -- [{champion_id, enemy_champion_id, lane, games_played, wins}]
  p_item_rows     jsonb,   -- [{champion_id, lane, item_ids, games_played, wins}]
  p_match_ids     text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_duplicates text[];
BEGIN
  -- 処理済みの試合が含まれていないか確認（バッチの同時実行などで起こり得る）
  SELECT array_agg(match_id) INTO v_duplicates
  FROM processed_matches
  WHERE match_id = ANY(p_match_ids);

  IF v_duplicates IS NOT NULL THEN
    RAISE EXCEPTION '処理済みの試合が % 件含まれています（バッチの同時実行の可能性）。例: %',
      array_length(v_duplicates, 1), array_to_string(v_duplicates[1:5], ', ');
  END IF;

  -- 先に記録する。同時実行で同じ試合IDが入った場合も主キー違反で全体が取り消される
  INSERT INTO processed_matches (match_id, patch)
  SELECT unnest(p_match_ids), p_patch;

  INSERT INTO champion_stats AS t
    (champion_id, lane, patch, region, rank_tier, games_played, wins, win_rate, updated_at)
  SELECT r.champion_id, r.lane, p_patch, p_region, p_rank_tier,
         r.games_played, r.wins, r.wins::numeric / r.games_played, now()
  FROM jsonb_to_recordset(p_champion_rows)
    AS r(champion_id int, lane text, games_played int, wins int)
  ON CONFLICT (champion_id, lane, patch, region, rank_tier) DO UPDATE SET
    games_played = t.games_played + EXCLUDED.games_played,
    wins         = t.wins + EXCLUDED.wins,
    win_rate     = (t.wins + EXCLUDED.wins)::numeric / (t.games_played + EXCLUDED.games_played),
    updated_at   = now();

  INSERT INTO counter_stats AS t
    (champion_id, enemy_champion_id, lane, patch, region, rank_tier, games_played, wins, win_rate, updated_at)
  SELECT r.champion_id, r.enemy_champion_id, r.lane, p_patch, p_region, p_rank_tier,
         r.games_played, r.wins, r.wins::numeric / r.games_played, now()
  FROM jsonb_to_recordset(p_counter_rows)
    AS r(champion_id int, enemy_champion_id int, lane text, games_played int, wins int)
  ON CONFLICT (champion_id, enemy_champion_id, lane, patch, region, rank_tier) DO UPDATE SET
    games_played = t.games_played + EXCLUDED.games_played,
    wins         = t.wins + EXCLUDED.wins,
    win_rate     = (t.wins + EXCLUDED.wins)::numeric / (t.games_played + EXCLUDED.games_played),
    updated_at   = now();

  INSERT INTO item_build_stats AS t
    (champion_id, lane, patch, region, rank_tier, item_ids, games_played, wins, win_rate, updated_at)
  SELECT r.champion_id, r.lane, p_patch, p_region, p_rank_tier, r.item_ids,
         r.games_played, r.wins, r.wins::numeric / r.games_played, now()
  FROM jsonb_to_recordset(p_item_rows)
    AS r(champion_id int, lane text, item_ids text, games_played int, wins int)
  ON CONFLICT (champion_id, lane, patch, region, rank_tier, item_ids) DO UPDATE SET
    games_played = t.games_played + EXCLUDED.games_played,
    wins         = t.wins + EXCLUDED.wins,
    win_rate     = (t.wins + EXCLUDED.wins)::numeric / (t.games_played + EXCLUDED.games_played),
    updated_at   = now();
END;
$$;

-- Supabase では public スキーマの関数は既定で anon / authenticated からも呼べるため、明示的に取り消す
REVOKE ALL ON FUNCTION apply_batch_result(text, text, text, jsonb, jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_batch_result(text, text, text, jsonb, jsonb, jsonb, text[]) TO service_role;
