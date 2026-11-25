---
paths:
  - "app/**"
  - "components/**"
  - "lib/**"
  - "scripts/**"
---

# コードの書き方（TypeScript・React・Next.js）

新しく書くコードと、直すコードに当てる。今のコードで外れている箇所は、そのファイルを直すときに合わせる。テストのファイルでは、モックのための `as`・`!` を使ってよい。

## 型

- `any` を使わない。型が分からないときは `unknown` にして、型ガードで絞る
- `!`（null でないという断定）を使わない。`?.` か、null を明示的に確かめる
- `as` は最小限にし、使うときは安全な理由をコメントに書く（`as const` は除く）
- 公開する関数（`export`）は、戻り値の型を書く。React のコンポーネントと route handler（`GET` など）は除く
- オブジェクトの型（Props・応答・DB の行）は `interface`、ユニオン型などは `type`
- `enum` を使わない。`as const` の配列か、文字列リテラルの型にする

## 名前

| 対象 | 形 | 例 |
|---|---|---|
| コンポーネント（ファイル・関数）・型 | PascalCase | `AppHeader.tsx`・`ChampionStatRow` |
| 変数・関数 | camelCase | `winRate`・`fetchChampions` |
| ファイル単位の定数 | UPPER_SNAKE_CASE | `MAX_LIMIT` |
| 真偽値 | `is`・`has`・`can` で始める | `isLoading` |
| イベントハンドラ | `handle` ＋ 対象 ＋ イベント | `handleLaneChange` |

## 書式

- スペース2つ・セミコロンあり・シングルクォート
- import は、組み込み → 外部パッケージ → `@/` → 相対パス（`./`）の順に並べる。型だけを読み込むときは `import type` か、名前の前に `type` を付ける

## React・Next.js

- Server Components を基本にする。Hooks・ブラウザの API・イベントハンドラを使うときだけ、ファイルの1行目に `'use client'` を書く
- Props は `interface` で、コンポーネントの直前に書く。省略できる Props の既定値は、引数の分割代入で決める
- `useEffect` の依存配列は必ず書く。空にするときは理由をコメントに書く
- 配色は 03 画面設計に従う（濃い背景の上で読める濃さにする）

## 非同期・エラー

- `async/await` と `try/catch` で書く。`.then()` はつなげない
- API Routes は全体を `try/catch` で囲む。エラーの応答は 05 の1章に従い、`lib/api.ts` の `badRequest`・`internalError` で返す（セキュリティの観点は `CLAUDE.md` のチェックリスト）
- バッチのリトライと書き込みは `riot-batch.md` に従う

## コメント

- 日本語で、「何をしているか」より「なぜそうしているか」を書く。ライブラリの制約や回避策も書く
- 型のプロパティは、自明でないものに単位や範囲を書く（例: `win_rate` は 0〜1）
- TODO は `// TODO: 理由と対応` の形。仮の実装には、何に差し替えるかを書く
