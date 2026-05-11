
# Journey Map × Omamori 実装計画（Gemma 4 主 + Gemini 補助・ハイブリッド版）

既存機能は無変更。Omamori 3機能を追加し、**新規AIは Gemma 4 (Ollama) を主、Gemini を補助**として併用するハイブリッドルーターで動かす。API料金を最小化。

---

## 0. 受領済みデータ → Supabase Storage `omamori-data` (public)

| File | サイズ | スキーマ |
|---|---|---|
| festivals.json | ~14MB | `name, desc, schedule, date, venue, pref, city, lat, lng, station, tags?, url?` |
| shelters.json  | ~24MB | `name, pref, addr, type, cap, eq, ts, fl, vo, lat, lng` |
| medical.json   | ~38MB | `name, pref, addr, type, beds, dept, em, lat, lng` |

---

## 1. AI ルーター（核心）— `src/lib/aiRouter.ts`

すべての新規AI呼び出しはこのルーター経由。料金最小化のため Gemma 4 を最優先。

```text
function chooseEngine(task, opts):
  if opts.forceGemini → gemini
  if ollamaAvailable():            → gemma4 (Ollama)        // 無料・優先
  elif task.requiresHighQuality:   → gemini-2.5-flash       // 補助
  elif !navigator.onLine:          → fallback静的テンプレ   // オフライン
  else:                            → gemini-2.5-flash-lite  // 最安
```

- `ollamaAvailable()`：起動時に `GET http://localhost:11434/api/tags`（タイムアウト1.5秒）で判定 → 30秒キャッシュ
- 全タスクに **オフライン静的フォールバック**（プリセット文／検索結果のみ表示）を必ず用意
- UIに現在のエンジンバッジ表示：`🟢 Gemma 4 (offline)` / `🔵 Gemini` / `⚪ Offline mode`

### タスク別ルーティング既定値

| タスク | 第1選択 | 第2選択 | 第3選択 |
|---|---|---|---|
| 通訳AIチャット | Gemma 4 | Gemini Flash Lite | プリセットフレーズ |
| Function Calling（祭り/避難所検索） | Gemma 4 | Gemini Flash | クライアントUI検索 |
| 祭りレコメンド文 | Gemma 4 | Gemini Flash Lite | TOP5の名称羅列 |
| Medical Card 生成 | Gemma 4 | Gemini Flash | プリセット2種 |
| 既存：写真解析/イベント検索/ニュース | **Gemini (既存Edge Function)** | — | — |

→ 既存機能は精度維持のため Gemini のまま（変更なし）。新規機能のみハイブリッド。

---

## 2. AI 実装

### 2-1. Ollama クライアント — `src/lib/ollama.ts`
- `chat(messages)`：`POST http://localhost:11434/api/chat`、`model: 'gemma4:e2b'`、`stream: false`
- `isOnline()`：`/api/tags` ヘルスチェック
- Function Calling：システムプロンプトにツール定義をJSON埋め込み、応答中の `{"tool":"...","args":{...}}` をパース→クライアント側 IDB 検索→結果を再投入する 2-pass 方式

### 2-2. Gemini Edge Function — `supabase/functions/omamori-ai/index.ts`
- 新規1本のみ。`task` パラメータで分岐（`chat` / `recommend` / `medical-card`）
- Lovable AI Gateway 経由（`google/gemini-2.5-flash-lite` を既定、Function Calling時は `gemini-2.5-flash`）
- JWT検証あり、CORS、429/402のエラーをクライアントへ返却
- システムプロンプトはバックエンド側で保持

### 2-3. ルーター統合
- `aiRouter.run(task, payload)` → 内部で `ollama.ts` か `supabase.functions.invoke('omamori-ai')` を呼ぶ
- 失敗時は次の選択肢に自動フォールバック

---

## 3. ナビゲーション・ルート

- 新規 `BottomNav`（モバイル風・全ルート下部固定）
  - `[🏠 Home] [🏮 Festivals] [💬 Communicate] [🚨 Emergency]`
- `Index.tsx` に Omamori 入口カード3枚追加（既存DOMは無変更）
- `App.tsx` に `/festivals` `/communicate` `/emergency` を追加（既存ルート無変更）

---

## 4. データ層

### 4-1. IndexedDB — `src/lib/omamoriDB.ts`
- `idb` 使用。ストア: `festivals` / `shelters` / `hospitals` / `meta`
- `loadDataset(name, url, onProgress)`：初回 fetch + IDB 保存、以降IDBから即返却
- 進捗バー：`ReadableStream` + `Content-Length`

### 4-2. 検索ユーティリティ — `src/lib/omamoriSearch.ts`
- `haversine()`、`findNearby()`、`fullTextFilter()`、都道府県プレフィルタ

---

## 5. 🏮 Festivals ページ

`src/pages/FestivalsPage.tsx`

- **Smart Recommendation**（Geolocation許可時）
  - 30km圏 × 現在月 → TOP5 → `aiRouter.run('recommend', items)` で要約文生成
  - オフライン時は静的「TOP5名称＋距離」表示
- 検索バー（300ms debounce）／カテゴリチップ／都道府県・月フィルタ
- 仮想スクロール（`@tanstack/react-virtual`、30件ずつ）
- カード: 月バッジ／場所／説明／タグ／📍View on Map／⚠️ Nearest shelter
- 「📸 あなたの写真の近くで開催された祭り」（既存`usePhotos`のEXIFと突合、ログイン時）

---

## 6. 💬 Communicate ページ

`src/pages/CommunicatePage.tsx`

- フレーズ `src/data/phrases.ts`（6カテゴリ × 27件、オフライン）
- カード：英／日（Noto Sans JP）／ローマ字／🔊 TTS（Web Speech API `lang='ja-JP'`）／📋 ShowCard 全画面
- **AIチャット**：`aiRouter.run('chat', messages)` ＋ Function Calling
  - ツール: `search_festivals` / `find_nearby_festivals` / `find_nearest_shelter` / `find_nearest_hospital`
  - クライアント側 IDB で実行 → 結果をモデルへ返して最終回答
  - `react-markdown` で描画
  - 上部に現在のエンジンバッジ表示

---

## 7. 🚨 Emergency ページ（100% オフライン優先）

`src/pages/EmergencyPage.tsx`

- 上部赤バナー（パルスアニメ）
- **Quick Action Grid 2×3**: 📍Shelter / 🏥Hospital / 🌊Earthquake / 💊Medical Card / 👮110 / 🚑119
- **避難所/病院モーダル**：Geolocation → IDB距離ソート → カードリスト＋災害種別/Emergency Onlyフィルタ→ Navigate (Google Maps)
- **地震ガイド**：静的6ステップ
- **Medical ShowCard**：プリセット2種＋ `aiRouter.run('medical-card', symptoms)`（Ollama→Gemini→プリセット）
- 重要電話番号（110/119/050-3816-2787/171）常時表示

→ AI機能を全て切ってもShelter検索/Hospital検索/地震ガイド/電話/プリセットShowCardは100%動作。

---

## 8. デザイン

- `src/index.css` に追加（既存トークン無変更）
  - `--omamori-gold: 41 80% 47%` / `--omamori-red: 6 78% 57%` / `omamori-pulse` keyframe
- `tailwind.config.ts` に `omamori-gold` / `omamori-red`
- `Noto Sans JP` を Google Fonts でロード

---

## 9. オフライン対応マトリクス

| 機能 | オフライン | エンジン |
|---|---|---|
| 避難所/病院/祭り検索 | ✅ | IDB + クライアント |
| 地震ガイド/電話/フレーズ/TTS/プリセットShowCard | ✅ | 静的 |
| AIチャット | ✅(Ollama) / ⚠(なければプリセット) | Gemma4 → Gemini → 静的 |
| 祭りレコメンド/Medical Card生成 | ✅(Ollama) / ⚠(静的) | 同上 |
| 既存写真解析/イベント検索/ニュース | ❌ | Gemini（無変更） |

既存 `vite-plugin-pwa` の `runtimeCaching` に Omamori ページ用キャッシュを追加。

---

## 10. 依存追加

- `idb` / `@tanstack/react-virtual` / `react-markdown`

---

## 11. 実装順序

1. ナビ・ルート骨格 + Omamori入口カード
2. Storageバケット作成 + 3JSONアップロード
3. IndexedDB + 検索ユーティリティ + 進捗バー付き初回ロード
4. Ollama クライアント + Gemini Edge Function (`omamori-ai`) + AIルーター
5. Festivalsページ（検索 + 写真連携 + ルーター経由レコメンド）
6. Emergencyページ（Quick Action + 検索 + ルーター経由 Medical Card）
7. Communicateページ（フレーズ + TTS + ShowCard + ルーター経由チャット + Function Calling）
8. エンジンバッジ + Noto Sans JP + Omamoriテーマ + PWAキャッシュ拡張

---

## 12. 注意事項

- **Ollama localhost** はブラウザから直接呼び出すため、本番デプロイ環境では到達しない端末も多い。その場合は自動で Gemini にフォールバック。ローカル開発・審査員のローカル環境では Gemma 4 が使われる
- 既存 Edge Function（`analyze-photo`, `search-events`, `search-news`, `evaluate-events`）は完全に無変更
- 既存DB/hooks/ページは無変更
- API料金最適化：第1選択は常に Gemma 4（無料）、第2は `gemini-2.5-flash-lite`（最安）、Function Callingなど精度必要時のみ `gemini-2.5-flash`
