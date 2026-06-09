<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# HEIC to JPG/PNG Converter

HEIC形式の写真をブラウザ上で高速かつ安全に JPEG / PNG に変換できるツールです。

## ローカルで起動

**前提:** Node.js

1. 依存関係をインストール:
   `npm install`
2. 開発サーバーを起動:
   `npm run dev`
3. ブラウザで開く:
   [http://localhost:3000](http://localhost:3000)

## Vercel へのデプロイ

### 方法1: Vercel ダッシュボード（おすすめ）

1. [Vercel](https://vercel.com) にログイン
2. **Add New… → Project**
3. GitHub リポジトリ `okaidoku109-svg/heic-to-jpg-png-comverter` をインポート
4. 設定はそのまま（`vercel.json` が自動適用されます）
5. **Deploy** をクリック

デプロイ完了後、次のような URL が発行されます:

`https://heic-to-jpg-png-comverter.vercel.app`

（プロジェクト名により異なります）

### 方法2: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

本番デプロイ:

```bash
vercel --prod
```

## 構成

| パス | 説明 |
|------|------|
| `/` | React フロントエンド（Vite ビルド） |
| `/api/convert` | HEIC 変換 API（サーバーレス関数） |
| `/api/health` | ヘルスチェック |

## 注意事項

- 通常の変換は **ブラウザ内** で実行されます（プライバシー保護）
- `/api/convert` はブラウザ変換が失敗したときの **フォールバック用** です
- Vercel のサーバーレス関数は **リクエストサイズ約 4.5MB まで** の制限があります

## リンク

- GitHub: https://github.com/okaidoku109-svg/heic-to-jpg-png-comverter
- AI Studio: https://ai.studio/apps/d452ceb5-62bc-4286-93c1-918373aadb82
