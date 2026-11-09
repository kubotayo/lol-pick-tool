-- LoL Pick Tool - 古いパッチのアイテムビルドを消す関数を追加（DB設計 v1.9.0）
--
-- 容量（Supabase Free の 500MB）を守るため、今のパッチと直前のパッチより古いパッチについて、
-- 容量の大半を占める item_build_stats と、重複除去にしか使わない processed_matches を消す。
-- champion_stats・counter_stats は残す（要件 FR-23「前パッチをアーカイブ」。勝率・対面勝率は過去のパッチも見られる）。
--
-- 1回の呼び出しで消すのは最大 p_limit 行。API の statement_timeout（8秒）にかからないよう、
-- バッチが 0 が返るまで繰り返し呼ぶ。
-- 実行できるのは service_role（バッチ）のみ。

-- 消す行を patch で探すための索引（item_build_stats の一意制約は patch が先頭ではないため使えない）
CREATE INDEX IF NOT EXISTS idx_item_build_patch ON item_build_stats (patch);

CREATE OR REPLACE FUNCTION archive_old_patches(
  p_current_patch text,           -- 今回のバッチの対象パッチ（例: '16.22'）
  p_limit         integer DEFAULT 20000
) RETURNS integer                 -- この呼び出しで消した行数（item_build_stats + processed_matches）
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old_patches text[];
  v_deleted     integer := 0;
  v_count       integer;
BEGIN
  -- パッチは「数字.数字」なので、数字の配列にして比べる（文字列のままだと '16.9' > '16.10' になるため）
  -- 直前のパッチ = 今のパッチより前で一番新しいパッチ。それより前のものを消す対象にする
  WITH patches AS (
    SELECT DISTINCT patch FROM champion_stats
    UNION
    SELECT DISTINCT patch FROM processed_matches
  ),
  older AS (
    SELECT patch, string_to_array(patch, '.')::int[] AS v
    FROM patches
    WHERE string_to_array(patch, '.')::int[] < string_to_array(p_current_patch, '.')::int[]
  ),
  previous AS (
    SELECT v FROM older ORDER BY v DESC LIMIT 1
  )
  SELECT array_agg(o.patch) INTO v_old_patches
  FROM older o, previous p
  WHERE o.v < p.v;

  IF v_old_patches IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM item_build_stats
  WHERE id IN (SELECT id FROM item_build_stats WHERE patch = ANY(v_old_patches) LIMIT p_limit);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_count;

  IF v_deleted < p_limit THEN
    DELETE FROM processed_matches
    WHERE match_id IN (SELECT match_id FROM processed_matches WHERE patch = ANY(v_old_patches) LIMIT p_limit - v_deleted);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;
  END IF;

  RETURN v_deleted;
END;
$$;

-- Supabase では public スキーマの関数は既定で anon / authenticated からも呼べるため、明示的に取り消す
REVOKE ALL ON FUNCTION archive_old_patches(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION archive_old_patches(text, integer) TO service_role;
