# 📸 PhotoTrail - 写真×AI で巡る日本の旅

写真のEXIFメタデータ（GPS・撮影日時）を活用して行動履歴を地図上に可視化し、Google Gemini AIによる写真解析やお祭り・イベント検索を組み合わせた旅の記録・発見プラットフォームです。

🌐 **デプロイ済みURL**: https://journey-map-n7ov5vse4a-an.a.run.app/

> ⚠️ **注意**: 一部機能の利用には外部APIキーが必要です。
> - **地図表示**: Mapbox アクセストークンが未設定の場合、初回アクセス時にブラウザ上で入力が必要です
> - **AI写真解析・イベント検索**: Google Gemini API キーが Edge Function のシークレットに設定されている必要があります
> - **周辺ニュース検索**: Perplexity API キーが Edge Function のシークレットに設定されている必要があります
> - 認証・データベース・写真ストレージは Supabase バックエンドで動作し、APIキー不要で利用できます

## 🎯 主な機能

| 機能 | 説明 |
|------|------|
| 📍 写真マップ | EXIF GPS情報から撮影地点を地図上にプロット。ヒートマップ表示対応 |
| 🤖 AI写真解析 | Google Gemini 2.5 Flash で写真の被写体・シーン・雰囲気を自動タグ付け |
| 🎪 イベント検索 | Gemini AIが指定地域の今後のお祭り・イベントを検索・マッピング |
| 📰 周辺ニュース | 撮影地点・日時に関連するニュースをPerplexity APIで検索 |
| 📊 統計ダッシュボード | 都道府県・市区町村カバー率、撮影統計を可視化 |
| 📅 タイムライン | 撮影日ごとの写真をタイムライン表示 |

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────┐
│              フロントエンド                    │
│   React + TypeScript + Tailwind CSS + Vite   │
│   Mapbox GL JS（地図描画）                     │
│   framer-motion（アニメーション）               │
├─────────────────────────────────────────────┤
│              バックエンド                      │
│   Supabase（認証・DB・ストレージ）              │
│   Edge Functions（サーバーレス処理）            │
├─────────────────────────────────────────────┤
│              AI / 外部API                     │
│   Google Gemini 2.5 Flash                    │
│     - 写真解析（画像→タグ・説明生成）           │
│     - イベント検索（地域×時期で祭り検索）        │
│   Perplexity API（ニュース検索）               │
│   Mapbox GL JS（地図タイル・ジオコーディング）    │
├─────────────────────────────────────────────┤
│              デプロイ                         │
│   Google Cloud Run（asia-northeast1）        │
│   Cloud Build による自動ビルド・デプロイ        │
└─────────────────────────────────────────────┘
```

## 🔑 Gemini API の活用

### 1. 写真解析（`analyze-photo`）
- 撮影画像をBase64エンコードしてGemini 2.5 Flashに送信
- タグ（被写体・場所・季節・雰囲気）、説明文、シーン分類、ムード判定を自動生成
- 有名な場所や人物の認識にも対応

### 2. イベント検索（`search-events`）
- 指定した都道府県・市区町村と時期をもとに、Geminiがウェブ上のお祭り・イベント情報を検索
- 各イベントの名称・住所・緯度経度・開催期間・見どころを構造化JSONで返却
- 過去のイベントや期間外のイベントを自動フィルタリング

## 🚀 セットアップ

### 必要な環境変数

| 変数名 | 説明 | 取得先 |
|--------|------|--------|
| `VITE_SUPABASE_URL` | Supabase プロジェクトURL | Supabase ダッシュボード |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase 匿名キー | Supabase ダッシュボード |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox アクセストークン（任意） | [Mapbox](https://account.mapbox.com/) |
| `GOOGLE_GEMINI_API_KEY` | Google AI Studio APIキー（Edge Function用） | [Google AI Studio](https://aistudio.google.com/) |
| `PERPLEXITY_API_KEY` | Perplexity APIキー（Edge Function用） | [Perplexity](https://docs.perplexity.ai/) |

### ローカル開発

```sh
git clone https://github.com/YasuhitoYanagisawa/journey-map.git
cd journey-map
npm install
npm run dev
```

### Cloud Run へのデプロイ

```sh
gcloud builds submit \
  --substitutions=_VITE_SUPABASE_URL=<URL>,_VITE_SUPABASE_PUBLISHABLE_KEY=<KEY>,_VITE_MAPBOX_ACCESS_TOKEN=<TOKEN>
```

または Cloud Build トリガーで GitHub リポジトリと連携して自動デプロイ。

## 📁 プロジェクト構成（主要ファイル）

```
src/
├── pages/           # ページコンポーネント
│   ├── Index.tsx    # ホーム（地図表示）
│   ├── Gallery.tsx  # ギャラリー
│   ├── Events.tsx   # イベント検索
│   ├── Feed.tsx     # フィード
│   └── Upload.tsx   # 写真アップロード
├── components/      # UIコンポーネント
│   ├── PhotoMap.tsx  # 写真マップ（Mapbox）
│   ├── EventMapView.tsx      # イベント地図
│   ├── EventSearchPanel.tsx  # イベント検索パネル
│   └── PhotoTimeline.tsx     # タイムライン
├── hooks/           # カスタムフック
│   ├── usePhotos.tsx  # 写真データ管理
│   └── useEvents.tsx  # イベントデータ管理
├── utils/           # ユーティリティ
│   ├── exifParser.ts          # EXIF解析
│   ├── reverseGeocode.ts      # 逆ジオコーディング
│   └── japanGeoData.ts        # 日本地理データ
supabase/
└── functions/       # Edge Functions
    ├── analyze-photo/   # Gemini写真解析
    ├── search-events/   # Geminiイベント検索
    └── search-news/     # Perplexityニュース検索
```

## 🛠️ 技術スタック

- **フロントエンド**: React 18 / TypeScript / Vite / Tailwind CSS
- **UI**: shadcn/ui / framer-motion
- **地図**: Mapbox GL JS
- **バックエンド**: Supabase（PostgreSQL / Auth / Storage / Edge Functions）
- **AI**: Google Gemini 2.5 Flash / Perplexity API
- **デプロイ**: Google Cloud Run / Cloud Build
- **EXIF解析**: exifr

## 📝 ライセンス

MIT
