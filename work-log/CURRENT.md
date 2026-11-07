# 現在の状況

最終更新: 2026-11-08

## 進行中のタスク

- **バッチのテスト**（PR #12〜#16 は development にマージ済み。テスト仕様書の作り込みの対策と、開始前のエラーが表示されない不具合の修正を、PR #17（ブランチ `test/spec-error-rules`）で作成。reviewer の確認・再レビュー済みで、マージ待ち）
  - テスト仕様書 `docs/06_batch-test-spec.html` v1.3.0（2.5「期待結果と判定の書き方」を追加）。単体の自動テストはすべて実装済み（全168件成功）。結合テスト DB-01〜11 はローカルの Supabase で全項目合格（`npm run it:db` でやり直せる）。ST・OT はまだ
  - ローカルの Supabase は `supabase/config.toml` を作成済み。Docker Desktop を起動して `npx supabase start` で使える
- DB（本番）には手元で確認した35試合分（正しいデータ）が入っている。migration 005 まで適用済み

## 次にやること

- [ ] PR #17（`test/spec-error-rules`）を development へマージする
- [ ] ST-01〜09 を実施（当日に Riot の Development Key を発行。ST-08 で DB-12、ST-09 で LOG-03 を確認）
- [ ] 06 の未決事項 Q-1〜Q-8 をユーザーと決める（特に Q-1: 開始ログ前のエラーが DB に残らない、Q-8: 手動実行に MAX_MATCHES の入力欄がない）
- [ ] P1・P2 が合格したら development → main へマージし、OT（Secrets 確認・手動実行）→ 定期実行を始める。Riot の Development Key は24時間で失効するので運用方法も決める
- [ ] API を Supabase に接続する（今はモックデータ。05 の「実装状況」参照）
- [ ] master_plus・diamond_plus の試合数を確認する（ST-03 で記録）

## 未解決の課題 / 保留中の確認事項


- `/api/patches` がビルド時に静的生成される。Supabase 接続時に動的にする
- 画面の lint エラー3件（もともとあったもの）
- 進み具合のログが100試合ごとにしか出ない。少ない試合数での確認時に状況が見えない
- Supabase 無料プランは、しばらくアクセスがないと自動で一時停止する。バッチの定期実行が始まるまでは、停止したらダッシュボードから再開する
- 古いパッチの試合が多いプレイヤーで収集が遅くなる問題は軽減済み（実際の速さは ST-07・定期実行で確認）
- PR はすべて development 向けに作る（積み上げ型は取り込み漏れが起きたため）
