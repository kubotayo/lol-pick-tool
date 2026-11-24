---
paths:
  - "scripts/**"
  - ".github/workflows/**"
  - "supabase/migrations/**"
---

# Riot API・バッチ

- Riot API キー（Personal Key。2026-11-08 に Development Key から変更）のレート制限は 20 req/秒・100 req/2分。リクエスト間隔は 1.2 秒、429 は指数バックオフ（1s → 2s → 4s → 8s）
- 試合の生データは保存せず、メモリ上で集計してから書き込む（ストレージ節約）
- 書き込みは DB 関数 `apply_batch_result` で1トランザクション・加算方式。収集済み試合は `processed_matches` で重複除外する
