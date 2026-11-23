---
paths:
  - "app/api/**"
  - "lib/api.ts"
  - "lib/supabase/**"
  - "lib/constants.ts"
  - "scripts/supabase*.ts"
  - "scripts/collect.ts"
  - "scripts/it/**"
  - "supabase/**"
---

# API Routes・Supabase

- サーバー側（API Routes）は anon キー、バッチは service_role キーを使う。フロントで直接使う値以外に `NEXT_PUBLIC_` を付けない
- counter_stats のように同じテーブルへの FK が2本ある場合、JOIN は `champions!fk_name(...)` で FK を明示する
- 統計の信頼性のため最低試合数フィルターを必ず適用する（値は設計書に従う）
- PostgREST の select は1回最大1000行。全件が必要なら `.range()` でページングする
- public スキーマに作った関数は既定で anon も実行できるので、`REVOKE` / `GRANT` を明示する
