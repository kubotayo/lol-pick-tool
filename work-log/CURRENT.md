# 現在の状況

最終更新: 2026-11-02

## 進行中のタスク

- **バッチ実装一式を PR でレビュー待ち**（2026-11-01 作成、マージ先は `development`）
  - #1 設計書を v1.4.0 に更新（`docs/design-v1.4.0`。未 push だった `fcad790` も含む）
  - #2 マイグレーション 002〜004（`db/migrations-002-004`。Supabase には適用済み）
  - #3 バッチ本体（`feat/batch-collect`。スクリプト・テスト・workflow）
  - #4 作業ログと CLAUDE.md のルール（`chore/work-log`）
- **エージェント構成の見直し**（`chore/agent-restructure`、未コミット）: `reviewer` を追加し、専門エージェント4つを削除、CLAUDE.md を書き換え。コミット・PR 作成はユーザーの指示待ち
- **ランク帯の実装**（未コミット）
  - コード: worktree `../lol-pick-tool-code`、ブランチ `feat/rank-tier`（`feat/batch-collect` から）。migration 005 は Supabase に適用済み
  - 設計書: worktree `../lol-pick-tool-docs`、ブランチ `docs/api-design`（`docs/design-v1.4.0` から）。01・02・04 v1.5.0、03 v1.1.0、05 新規
  - 手元で30試合の実行を確認済み。DB に30試合分（正しいデータ）が入っている
- バッチのローカル確認は完了（50試合 + 10試合で、データの中身・加算・重複スキップ・実行ログを確認）

## 次にやること

- [ ] 3つの作業ブランチ（agent-restructure・api-design・rank-tier）のコミット・PR 作成（ユーザーの指示待ち）
- [ ] master_plus・diamond_plus がほぼ空になる問題の扱いを決める
- [ ] 各 PR の CI 結果を確認し、レビュー・マージする
- [ ] マージ後、ローカルの `development` を `origin/development` に合わせる（ローカルには未 push の `fcad790` が残っているが、#1 に含まれている）
- [ ] GitHub Actions の Secrets（`RIOT_API_KEY` など）を確認し、定期実行を始める

## 未解決の課題 / 保留中の確認事項

- 005 適用済みのため、PR #3 単体の古いコードでは DB に書き込めない（#3 は feat/rank-tier と一緒にマージする）
- collect.ts のメインループにテストがない（reviewer の指摘）

- CHALLENGER / GRANDMASTER のシード取得が 400 エラー（エンドポイントが apex ティア非対応）。今は DIAMOND I で足りているが、直すかは未定
- 進み具合のログが100試合ごとにしか出ない。少ない試合数での確認時に状況が見えない
- 古いパッチや処理済みの試合のスキップが多く、収集が遅い（50試合で9分、10試合で8分）
- DB には確認用に実行した60試合分のデータが入っている（正しいデータなので残している）
- Supabase 無料プランは、しばらくアクセスがないと自動で一時停止する。バッチの定期実行が始まるまでは、停止したらダッシュボードから再開する
