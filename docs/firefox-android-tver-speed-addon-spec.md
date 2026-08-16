# Firefox Android版 TVer再生速度変更アドオン移植仕様書・実装指示書

## 1. 目的

Kiwiブラウザー用に作成したTVer再生速度変更アドオンを、Firefox Androidで利用できるWebExtensionへ移植する。

Firefox AndroidではTVerのWeb版が再生できることを確認済みであるため、Firefox上でTVerの`video`要素を検出し、再生速度を変更する。

## 2. 前提

- 対象ブラウザー：Firefox Android
- 対象サイト：TVer Web版
- 対象ドメイン：`tver.jp`および`*.tver.jp`
- 個人利用・試作を前提とする
- TVerアプリの改造は行わない
- 広告削除、動画保存、視聴判定回避、DRM回避は実装しない
- TVer側の仕様変更で動作しなくなる可能性がある
- Firefox Androidの正式版へインストールするには、Mozilla Add-ons（AMO）で署名されたアドオンが必要になる場合がある

## 3. Kiwi版からの主な変更点

### 変更するもの

- `manifest.json`のFirefox対応設定
- Chrome固有APIのFirefox互換対応
- `browser_specific_settings`の追加
- Firefox Androidでのアドオンインストール手順
- FirefoxでのTVer動画検出処理の確認

### 変更しないもの

- 再生速度変更の基本処理
- TVerだけを対象にする方針
- 速度設定の保存
- 動画切り替え時の再適用
- 速度パネルの基本デザイン

## 4. 推奨ファイル構成

```text
tver-speed-firefox/
├─ manifest.json
├─ content.js
├─ content.css
├─ popup.html
├─ popup.js
├─ popup.css
├─ icons/
│  ├─ icon-16.png
│  ├─ icon-48.png
│  └─ icon-128.png
└─ README.md
```

## 5. manifest.json仕様

Manifest V3を基本とする。ただしFirefox AndroidのバージョンやAPI対応状況で問題が出る場合は、Manifest V2互換版を検討する。

例：

```json
{
  "manifest_version": 3,
  "name": "TVer再生速度変更",
  "version": "0.1.0",
  "description": "Firefox AndroidのTVer Web版で再生速度を変更します。",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://tver.jp/*",
    "https://*.tver.jp/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://tver.jp/*",
        "https://*.tver.jp/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "TVer再生速度",
    "default_popup": "popup.html"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "tver-speed@example.local",
      "strict_min_version": "120.0"
    },
    "gecko_android": {
      "strict_min_version": "120.0"
    }
  }
}
```

実装時は、Firefoxが対応していないManifestキーや権限を残さない。特にChrome専用の`update_url`、不要な`background.service_worker`、未使用の権限は削除またはFirefox対応を確認する。

## 6. API互換仕様

Chrome APIを直接呼び出している場合は、Firefox互換性を確認する。

```javascript
const browserApi = globalThis.browser ?? globalThis.chrome;
```

設定保存は次のAPIを使用する。

```javascript
await browserApi.storage.local.set({
  speed: 2.0,
  autoApply: true,
  enabled: true
});
```

取得処理：

```javascript
const settings = await browserApi.storage.local.get({
  speed: 1.0,
  autoApply: true,
  enabled: true
});
```

FirefoxでPromise形式が利用できない環境に備え、必要に応じてcallback形式またはWebExtension Polyfillを使用する。

## 7. content.js実装仕様

### 初期処理

- TVerドメイン以外では処理しない
- ページ読み込み後に設定を取得する
- `video`要素を検出する
- 速度パネルを1回だけ生成する

### 動画検出

以下を組み合わせる。

- `document.querySelectorAll('video')`
- `MutationObserver`
- `loadedmetadata`
- `play`
- `playing`
- `ratechange`

TVerはSPA形式の画面遷移や広告・本編切り替えでvideo要素が変更される可能性があるため、初回検出だけで終了しない。

### 速度設定

```javascript
function applySpeed(video, speed) {
  if (!(video instanceof HTMLVideoElement)) return;
  if (!Number.isFinite(speed)) return;
  if (video.playbackRate !== speed) {
    video.playbackRate = speed;
  }
}
```

初期速度は1.0倍とする。MVPで選択可能な速度は次の通り。

- 0.5倍
- 1.0倍
- 1.25倍
- 1.5倍
- 2.0倍
- 3.0倍
- 4.0倍

### 再設定ループ対策

`ratechange`イベントで毎回無条件に値を設定してはいけない。拡張機能が設定した速度と異なる場合だけ再設定する。

また、TVer側が再生開始時に速度を戻す場合に備えて、次のタイミングで再適用する。

- video検出直後
- `loadedmetadata`
- `play`
- `playing`
- 画面遷移後
- 設定変更通知を受けたとき

## 8. 速度パネル仕様

- 位置：初期は画面右下
- `position: fixed`を使用
- `z-index`はTVer画面上で表示できる十分な値にする
- 横画面・縦画面の両方に対応
- 画面幅が狭い場合は2段表示または横スクロール
- 動画操作の邪魔にならないサイズにする
- TVerのDOMクラス名に依存しない独自クラス名を使用する

独自クラス名例：

```text
tver-speed-addon-panel
tver-speed-addon-button
tver-speed-addon-current
```

ボタン押下時は、速度を保存し、現在検出できるすべてのvideoへ適用する。

## 9. popup仕様

ポップアップでは次を設定できるようにする。

- 再生速度
- 自動適用ON/OFF
- アドオン有効/無効

設定変更後、表示中のTVerタブへメッセージを送り、即時反映する。

メッセージ例：

```javascript
browserApi.tabs.query({
  active: true,
  currentWindow: true
}).then(tabs => {
  if (tabs[0]?.id) {
    return browserApi.tabs.sendMessage(tabs[0].id, {
      type: "SET_SPEED",
      speed: 2.0
    });
  }
});
```

## 10. Firefox Androidへのインストール方法

### 方法A：AMOに登録する方法（推奨）

1. Mozilla Add-ons Developer Hubに開発者アカウントでログイン
2. アドオンのZIPまたはXPIをアップロード
3. 自動検証を実行
4. 問題がなければ、非公開（Unlisted）または公開（Listed）で署名する
5. 署名済みアドオンをFirefox Androidから開いて追加する

個人利用だけなら、一般公開しないUnlisted形式を優先する。

### 方法B：Firefox Androidでファイルから追加する方法

Mozilla公式手順に従い、署名済みのXPIファイルを端末に保存する。

1. Firefox Androidで「設定」→「Firefoxについて」を開く
2. Firefoxのロゴを5回すばやくタップする
3. 設定画面に戻る
4. 「ファイルから拡張機能をインストール」を開く
5. 署名済みの`.xpi`ファイルを選択
6. 追加確認を行う
7. アドオン一覧で有効になっていることを確認

未署名の自作アドオンは、Firefox Androidの正式版ではインストールできない場合がある。まずAMOでUnlisted署名を取得する。

## 11. テスト手順

### テスト1：FirefoxでTVerが再生できること

1. Firefox AndroidでTVerを開く
2. 必要に応じて「PC版サイト」をONにする
3. 番組ページを開く
4. 動画がブラウザ内で再生されることを確認する

### テスト2：アドオンの読み込み

1. Firefoxのアドオン一覧を開く
2. TVer再生速度変更アドオンが表示されることを確認する
3. アドオンを有効にする
4. TVerタブを完全に閉じて再度開く

### テスト3：速度パネル

- 速度パネルが表示される
- 1倍から2倍へ変更できる
- 2倍から3倍へ変更できる
- 現在速度が表示される
- 縦画面で画面外にはみ出さない
- 横画面で動画操作を邪魔しない

### テスト4：再適用

- TVerページを再読み込みする
- 番組を変更する
- 広告から本編へ切り替える
- 動画を一時停止して再開する
- Firefoxを再起動する

各ケースで保存済み速度が適用されることを確認する。

## 12. 動作しない場合の確認

### パネルが表示されない

- アドオンが有効か確認
- TVerタブを再読み込み
- `matches`が`https://tver.jp/*`と`https://*.tver.jp/*`になっているか確認
- `content.js`にエラーがないか確認
- content scriptが実行される前にページ遷移していないか確認

### パネルは表示されるが速度が変わらない

- video要素の検出数をログ出力する
- `video.playbackRate`の値をログ出力する
- 広告再生中ではなく本編で試す
- TVer側が再生開始時に値を戻していないか確認
- `MutationObserver`が動いているか確認

### ポップアップから反映されない

- TVerタブがアクティブか確認
- `tabs`権限が必要か確認
- `tabs.sendMessage`の送信先タブIDを確認
- ページ再読み込み後にcontent scriptが起動しているか確認

## 13. 開発時の検証コマンド

PCにNode.jsを用意し、Mozillaの`web-ext`で検証する。

```bash
npm install --global web-ext
web-ext lint --source-dir ./tver-speed-firefox
```

Firefox Android固有の非対応項目が出た場合は、警告を放置せず内容を確認する。

## 14. 完了条件

- Firefox Androidへ署名済みアドオンをインストールできる
- TVerのWeb版で速度パネルが表示される
- 1倍、2倍、3倍など複数速度を選択できる
- 選択した速度が動画へ反映される
- 番組変更後も速度が再適用される
- 設定が再起動後も保持される
- TVer以外では動作しない
- TVerアプリを起動しない
- 広告削除、動画保存、視聴判定回避を含まない

## 15. 実装指示文

> Kiwi版TVer再生速度変更アドオンをFirefox Android対応へ移植してください。この仕様書に従い、Firefox WebExtension形式、TVerドメイン限定のcontent script、video要素検出、速度パネル、0.5倍〜4倍の速度変更、設定保存、動画切り替え時の再適用を実装してください。Chrome固有APIはFirefox互換APIへ対応させ、manifest.jsonへbrowser_specific_settings.geckoおよびgecko_androidを追加してください。Mozillaのweb-ext lintで検証できる構成にし、Firefox Androidで署名済みXPIをファイルからインストールできるようREADME.mdに手順を記載してください。広告削除、動画保存、視聴判定回避、DRM回避は実装しないでください。`

