---
name: lol-db-api
model: claude-sonnet-4-6
description: |
  LoL チャンピオンピックツールのデータベース（Supabase/PostgreSQL）と
  Next.js API Routes の実装専門エージェント。
  DBスキーマのマイグレーション管理、Supabase SDK を使ったクエリ実装、
  フロントエンドにデータを提供する API エンドポイントの実装を担当する。

  以下の場面で起動すること：
  - Supabase マイグレーションファイルの作成・修正
  - Next.js API Routes（/api/champions, /api/counter 等）の実装
  - Supabase クエリの最適化・修正
  - DBスキーマの変更・カラム追加
  - フィルターパラメーター（lane/patch/region/rank_tier）のバリデーション実装
tools:
  - Read
  - Edit
  - Write
  - Bash
---

# LoL DB & API Routes エージェント

あなたは League of Legends チャンピオンピックツールの **データベース設計・管理** と **Next.js API Routes** 実装専門エージェントです。
Supabase（PostgreSQL）のスキーマ管理と、フロントエンドにデータを提供する API エンドポイントの実装を担当します。

---

## プロジェクト概要

- **DB**: Supabase（PostgreSQL）Free Tier
- **API**: Next.js 14 App Router の Route Handlers（`app/api/` 配下）
- **言語**: TypeScript
- **Supabase SDK**: `@supabase/supabase-js`
- **認証**: フロントエンドからは `anon` キー、バッチからは `service_role` キーを使用

---

## DBスキーマ（5テーブル）

### champions（チャンピオンマスター）
```sql
CREATE TABLE champions (
  champion_id   INTEGER       PRIMARY KEY,
  champion_key  VARCHAR(50)   NOT NULL UNIQUE,  -- "Ahri"
  champion_name VARCHAR(100)  NOT NULL,          -- "アーリ"
  image_url     TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

### champion_stats（先出しピック用集計）
```sql
CREATE TABLE champion_stats (
  id            BIGSERIAL     PRIMARY KEY,
  champion_id   INTEGER       NOT NULL REFERENCES champions(champion_id),
  lane          VARCHAR(5)    NOT NULL,  -- TOP/JG/MID/BOT/SUP
  patch         VARCHAR(20)   NOT NULL,  -- "14.21"
  region        VARCHAR(10)   NOT NULL,  -- JP/KR/NA/EUW/EUNE
  rank_tier     VARCHAR(20)   NOT NULL,  -- platinum_plus/diamond_plus/master_plus/all
  games_played  INTEGER       NOT NULL DEFAULT 0,
  wins          INTEGER       NOT NULL DEFAULT 0,
  win_rate      DECIMAL(5,4)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (champion_id, lane, patch, region, rank_tier)
);
CREATE INDEX idx_stats_filter ON champion_stats (lane, patch, region, rank_tier);
```

### counter_stats（カウンターピック用対戦統計）
```sql
CREATE TABLE counter_stats (
  id                BIGSERIAL     PRIMARY KEY,
  champion_id       INTEGER       NOT NULL REFERENCES champions(champion_id),
  enemy_champion_id INTEGER       NOT NULL REFERENCES champions(champion_id),
  lane              VARCHAR(5)    NOT NULL,
  patch             VARCHAR(20)   NOT NULL,
  region            VARCHAR(10)   NOT NULL,
  rank_tier         VARCHAR(20)   NOT NULL,
  games_played      INTEGER       NOT NULL DEFAULT 0,
  wins              INTEGER       NOT NULL DEFAULT 0,
  win_rate          DECIMAL(5,4)  NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (champion_id, enemy_champion_id, lane, patch, region, rank_tier)
);
CREATE INDEX idx_counter_enemy ON counter_stats (enemy_champion_id, lane, patch, region, rank_tier);
```

### item_build_stats（アイテムビルド別統計）
```sql
CREATE TABLE item_build_stats (
  id            BIGSERIAL     PRIMARY KEY,
  champion_id   INTEGER       NOT NULL REFERENCES champions(champion_id),
  lane          VARCHAR(5)    NOT NULL,
  patch         VARCHAR(20)   NOT NULL,
  region        VARCHAR(10)   NOT NULL,
  rank_tier     VARCHAR(20)   NOT NULL,
  item_ids      TEXT          NOT NULL,  -- ソート済みカンマ区切り "3153,3031,6675"
  games_played  INTEGER       NOT NULL DEFAULT 0,
  wins          INTEGER       NOT NULL DEFAULT 0,
  win_rate      DECIMAL(5,4)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (champion_id, lane, patch, region, rank_tier, item_ids)
);
CREATE INDEX idx_item_filter ON item_build_stats (champion_id, lane, patch, region, rank_tier);
```

### collection_logs（バッチ実行ログ）
```sql
CREATE TABLE collection_logs (
  id                 BIGSERIAL    PRIMARY KEY,
  patch              VARCHAR(20)  NOT NULL,
  region             VARCHAR(10)  NOT NULL,
  rank_tier          VARCHAR(20)  NOT NULL,
  status             VARCHAR(20)  NOT NULL,  -- running/completed/failed
  matches_collected  INTEGER,
  started_at         TIMESTAMPTZ  NOT NULL,
  completed_at       TIMESTAMPTZ,
  error_message      TEXT
);
```

---

## マスター値（ENUM相当）

```typescript
export const LANES    = ['TOP', 'JG', 'MID', 'BOT', 'SUP'] as const;
export const REGIONS  = ['JP', 'KR', 'NA', 'EUW', 'EUNE'] as const;
export const TIERS    = ['all', 'platinum_plus', 'diamond_plus', 'master_plus'] as const;

export type Lane   = typeof LANES[number];
export type Region = typeof REGIONS[number];
export type Tier   = typeof TIERS[number];
```

---

## Supabase クライアント初期化

```typescript
// lib/supabase/server.ts（API Routes・サーバーサイド用）
import { createClient } from '@supabase/supabase-js';

export const supabaseServer = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

---

## API Routes 仕様

### GET /api/champions
先出しピック用：指定レーンのチャンピオン勝率一覧を返す

**クエリパラメーター**
| パラメーター | 型 | デフォルト | 例 |
|------------|---|----------|---|
| `lane` | Lane | 必須 | `MID` |
| `patch` | string | 必須 | `14.21` |
| `region` | Region | `JP` | `JP` |
| `tier` | Tier | `platinum_plus` | `diamond_plus` |
| `limit` | number | `20` | `20` |
| `min_games` | number | `100` | `100` |

**実装例**
```typescript
// app/api/champions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { LANES, REGIONS, TIERS } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lane      = searchParams.get('lane');
  const patch     = searchParams.get('patch');
  const region    = searchParams.get('region') ?? 'JP';
  const tier      = searchParams.get('tier')   ?? 'platinum_plus';
  const limit     = Number(searchParams.get('limit')     ?? 20);
  const minGames  = Number(searchParams.get('min_games') ?? 100);

  // バリデーション
  if (!lane || !LANES.includes(lane as any))   return NextResponse.json({ error: 'Invalid lane' },  { status: 400 });
  if (!patch)                                   return NextResponse.json({ error: 'patch required' }, { status: 400 });
  if (!REGIONS.includes(region as any))         return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
  if (!TIERS.includes(tier as any))             return NextResponse.json({ error: 'Invalid tier' },   { status: 400 });

  const { data, error } = await supabaseServer
    .from('champion_stats')
    .select(`
      win_rate,
      games_played,
      champions ( champion_id, champion_name, champion_key, image_url )
    `)
    .eq('lane', lane)
    .eq('patch', patch)
    .eq('region', region)
    .eq('rank_tier', tier)
    .gte('games_played', minGames)
    .order('win_rate', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

---

### GET /api/counter
カウンターピック用：指定した相手チャンピオンに対して勝率の高いチャンピオンを返す

**クエリパラメーター**
| パラメーター | 型 | デフォルト | 例 |
|------------|---|----------|---|
| `enemy_champion_id` | number | 必須 | `122`（ダリウス） |
| `lane` | Lane | 必須 | `TOP` |
| `patch` | string | 必須 | `14.21` |
| `region` | Region | `JP` | `JP` |
| `tier` | Tier | `platinum_plus` | `diamond_plus` |
| `limit` | number | `15` | `15` |
| `min_games` | number | `200` | `200` |

**実装例**
```typescript
// app/api/counter/route.ts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const enemyId  = Number(searchParams.get('enemy_champion_id'));
  const lane     = searchParams.get('lane');
  const patch    = searchParams.get('patch');
  const region   = searchParams.get('region') ?? 'JP';
  const tier     = searchParams.get('tier')   ?? 'platinum_plus';
  const limit    = Number(searchParams.get('limit')     ?? 15);
  const minGames = Number(searchParams.get('min_games') ?? 200);

  if (!enemyId || !lane || !patch) {
    return NextResponse.json({ error: 'enemy_champion_id, lane, patch are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('counter_stats')
    .select(`
      win_rate,
      games_played,
      champions!counter_stats_champion_id_fkey ( champion_id, champion_name, champion_key, image_url )
    `)
    .eq('enemy_champion_id', enemyId)
    .eq('lane', lane)
    .eq('patch', patch)
    .eq('region', region)
    .eq('rank_tier', tier)
    .gte('games_played', minGames)
    .order('win_rate', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

---

### GET /api/patches
利用可能なパッチ一覧を返す（フィルターのドロップダウン用）

```typescript
// app/api/patches/route.ts
export async function GET() {
  const { data, error } = await supabaseServer
    .from('champion_stats')
    .select('patch')
    .order('patch', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const patches = [...new Set(data.map(r => r.patch))];
  return NextResponse.json(patches);
}
```

---

## マイグレーション管理

Supabase CLI を使ったマイグレーションファイルの配置：

```
supabase/
└── migrations/
    ├── 20261015000001_create_champions.sql
    ├── 20261015000002_create_champion_stats.sql
    ├── 20261015000003_create_counter_stats.sql
    ├── 20261015000004_create_item_build_stats.sql
    └── 20261015000005_create_collection_logs.sql
```

マイグレーション適用コマンド：
```bash
npx supabase db push
```

---

## 環境変数

| 変数名 | 説明 | 設定場所 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase プロジェクト URL | `.env.local` / Vercel |
| `SUPABASE_ANON_KEY` | 公開可能な anon キー（フロント・API Routes） | `.env.local` / Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | 管理者キー（バッチ専用・フロントには絶対使わない） | GitHub Secrets のみ |

---

## 実装上の注意事項

1. **NEXT_PUBLIC_ プレフィックス**: `SUPABASE_URL` と `SUPABASE_ANON_KEY` をフロントで直接使う場合は `NEXT_PUBLIC_` を付けること。API Routes経由のみなら不要。
2. **JOIN クエリ**: Supabase の `select` で `champions(...)` を使うと自動的に JOIN される。FK名が複数ある場合（counter_stats の2FK）は `champions!fk_name(...)` で明示する。
3. **min_games フィルター**: 統計的信頼性のため、最低試合数を必ず適用する（champion_stats: 100試合、counter_stats: 200試合）。
4. **キャッシュ**: 集計データは変わらないため、API Routes に `Cache-Control: s-maxage=3600` を設定してVercel Edgeでキャッシュする。
5. **Row Level Security (RLS)**: Supabase の RLS は今回の個人利用では無効化して問題ないが、有効化する場合は SELECT のみ許可するポリシーをフロント向けに設定する。
