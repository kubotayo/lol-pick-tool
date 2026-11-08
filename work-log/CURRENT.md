# 現在の状況

最終更新: 2026-11-08（サイトの非公開化）

## 進行中のタスク

- **バッチのテスト**（PR #12〜#19 は development にマージ済み）
  - テスト仕様書 `docs/06_batch-test-spec.html` v1.3.0（2.5「期待結果と判定の書き方」を追加）。単体の自動テストはすべて実装済み（全168件成功）。結合テスト DB-01〜11 はローカルの Supabase で全項目合格（`npm run it:db` でやり直せる）。ST・OT はまだ
  - ローカルの Supabase は `supabase/config.toml` を作成済み。Docker Desktop を起動して `npx supabase start` で使える
- **Web サイトは非公開**（2026-11-08。Vercel Authentication を All Deployments に設定。Personal Key のデータは一般公開できないため）。設計書の反映は PR #20（ブランチ `docs/private-site-personal-key`）でマージ待ち
- Riot API キーは Personal Key（承認済み・有効期限なし）
- DB（本番）には手元で確認した35試合分（正しいデータ）が入っている。migration 005 まで適用済み

## 次にやること

- [ ] PR #20（`docs/private-site-personal-key`）を development へマージする
- [ ] ST-01〜09 を実施（Personal Key を使う。ST-08 で DB-12、ST-09 で LOG-03 を確認）。06 の「Development Key（当日に発行）」の記述も直す
- [ ] 06 の未決事項 Q-1〜Q-8 をユーザーと決める（特に Q-1: 開始ログ前のエラーが DB に残らない、Q-8: 手動実行に MAX_MATCHES の入力欄がない）
- [ ] P1・P2 が合格したら development → main へマージし、OT（Secrets 確認・手動実行）→ 定期実行を始める。GitHub Secrets の RIOT_API_KEY を Personal Key にする
- [ ] API を Supabase に接続する（今はモックデータ。05 の「実装状況」参照）
- [ ] master_plus・diamond_plus の試合数を確認する（ST-03 で記録）

## 未解決の課題 / 保留中の確認事項

- 一般公開したくなったら Production Key の申請が必要（動くサイト・認証済みドメイン・利用規約とプライバシーポリシー、Riot 指定の免責文の表示）。それまでサイトは非公開のまま

- `/api/patches` がビルド時に静的生成される。Supabase 接続時に動的にする
- 画面の lint エラー3件（もともとあったもの）
- 進み具合のログが100試合ごとにしか出ない。少ない試合数での確認時に状況が見えない
- Supabase 無料プランは、しばらくアクセスがないと自動で一時停止する。バッチの定期実行が始まるまでは、停止したらダッシュボードから再開する
- 古いパッチの試合が多いプレイヤーで収集が遅くなる問題は軽減済み（実際の速さは ST-07・定期実行で確認）
- PR はすべて development 向けに作る（積み上げ型は取り込み漏れが起きたため）
