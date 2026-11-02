-- LoL Pick Tool - 全テーブルで RLS を有効化（DB設計 v1.3.0）
--
-- 方針:
--   - 画面表示用の4テーブル: anon は SELECT のみ許可（API Routes が anon キーで読み取るため）
--   - バッチ専用の2テーブル（collection_logs / processed_matches）: ポリシーなし = anon からはアクセス不可
--   - 書き込みはバッチの service_role キーのみ（service_role は RLS をバイパスする）

ALTER TABLE champions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE champion_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_build_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_champions"        ON champions        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_champion_stats"   ON champion_stats   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_counter_stats"    ON counter_stats    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_item_build_stats" ON item_build_stats FOR SELECT TO anon USING (true);
