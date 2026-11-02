# 現在の状況

最終更新: 2026-11-02

## 進行中のタスク

- **バッチ実装一式を PR でレビュー待ち**（2026-11-01 作成、マージ先は `development`）
  - #1 設計書を v1.4.0 に更新（`docs/design-v1.4.0`。未 push だった `fcad790` も含む）
  - #2 マイグレーション 002〜004（`db/migrations-002-004`。Supabase には適用済み）
  - #3 バッチ本体（`feat/batch-collect`。スクリプト・テスト・workflow）
  - #4 作業ログと CLAUDE.md のルール（`chore/work-log`）
- **エージェント構成の見直し**（`chore/agent-restructure`、未コミット）: `reviewer` を追加し、専門エージェント4つを削除、CLAUDE.md を書き換え。コミット・PR 作成はユーザーの指示待ち
- **追加の PR を作成**（2026-11-02、レビュー待ち）。土台の PR の上に積んでいる
  - #5 エージェント構成の見直し（`chore/agent-restructure`、base: #4 の `chore/work-log`）
  - #6 API設計書・ランク帯の仕様（`docs/api-design`、base: #1 の `docs/design-v1.4.0`）。worktree `../lol-pick-tool-docs`
  - #7 ランク帯の実装（`feat/rank-tier`、base: #3 の `feat/batch-collect`）。worktree `../lol-pick-tool-code`。migration 005 は Supabase に適用済み
- DB には手元で確認した35試合分（正しいデータ）が入っている
- バッチのローカル確認は完了（50試合 + 10試合で、データの中身・加算・重複スキップ・実行ログを確認）

## 次にやること

- [ ] #1〜#7 のレビュー・マージ（順番: #4 → #5、#1 → #6、#2 → #3 と #7 は一緒に）
- [ ] master_plus・diamond_plus の試合数を、4ランクで集め始めてから確認する（少なすぎれば基準を調整。ユーザーは案A=様子見を選択）
- [ ] 各 PR の CI 結果を確認し、レビュー・マージする
- [ ] マージ後、ローカルの `development` を `origin/development` に合わせる（ローカルには未 push の `fcad790` が残っているが、#1 に含まれている）
- [ ] GitHub Actions の Secrets（`RIOT_API_KEY` など）を確認し、定期実行を始める

## 未解決の課題 / 保留中の確認事項

- 005 適用済みのため、PR #3 単体の古いコードでは DB に書き込めない（#3 は feat/rank-tier と一緒にマージする）
- #5〜#7 は CI が動かない（CI の対象が main / development 向けの PR のみ）
- 画面の lint エラー3件（もともとあったもの）
- worktree 2つ（`../lol-pick-tool-docs`・`../lol-pick-tool-code`）はマージ後に `git worktree remove` で片付ける

- CHALLENGER / GRANDMASTER のシード取得が 400 エラー（エンドポイントが apex ティア非対応）。今は DIAMOND I で足りているが、直すかは未定
- 進み具合のログが100試合ごとにしか出ない。少ない試合数での確認時に状況が見えない
- 古いパッチや処理済みの試合のスキップが多く、収集が遅い（50試合で9分、10試合で8分）
- DB には確認用に実行した60試合分のデータが入っている（正しいデータなので残している）
- Supabase 無料プランは、しばらくアクセスがないと自動で一時停止する。バッチの定期実行が始まるまでは、停止したらダッシュボードから再開する
