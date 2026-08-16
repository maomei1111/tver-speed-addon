# TVer 再生速度変更アドオン（Firefox Android版）

Kiwiブラウザー向けに作成した[TVer再生速度変更アドオン](../README.md)を、Firefox AndroidのWebExtensionへ移植した版です。
詳細仕様は [`docs/firefox-android-tver-speed-addon-spec.md`](../docs/firefox-android-tver-speed-addon-spec.md) を参照してください。

個人利用を想定した試作版です。TVerアプリの改造、広告削除、視聴回数の不正操作、視聴判定の回避、動画ダウンロード、DRM回避は行いません。

## ファイル構成

```text
tver-speed-firefox/
├─ manifest.json      … Manifest V3 定義（TVerドメイン限定、Firefox/Android向け設定込み）
├─ content.js          … video要素検出・速度適用・パネルUI・popupからのメッセージ受信
├─ content.css         … 速度パネルのスタイル（独自クラス名 tver-speed-addon-*）
├─ popup.html/.js/.css … 拡張機能アイコンから開く設定画面（設定変更を即時タブへ通知）
├─ icons/               … 拡張機能アイコン（icon-16/48/128.png）
├─ scripts/gen-icons.js … アイコン再生成用スクリプト（Node.js, 任意）
└─ README.md            … このファイル
```

## Kiwi版からの変更点

- `globalThis.browser ?? globalThis.chrome`でFirefox/Chrome双方のAPIに対応（`browserApi`）。
- `manifest.json`に`host_permissions`と`browser_specific_settings.gecko` / `gecko_android`を追加。
- `chrome.storage.local`のcallback形式・Promise形式どちらでも動くよう、`content.js`/`popup.js`内にラッパーを実装。
- ポップアップでの設定変更は`chrome.storage.local`への保存に加え、`tabs.query` + `tabs.sendMessage`で表示中のTVerタブへ`SET_SPEED` / `SET_AUTO_APPLY` / `SET_ENABLED`メッセージを送信し即時反映する。
- 速度パネルのクラス名をTVerのDOMに依存しない独自名（`tver-speed-addon-panel`など）に変更。
- 再生速度変更ロジック・保存内容・動画切り替え時の再適用・パネルの基本デザインはKiwi版から変更していない。

## AMOのデータ収集許可について

`web-ext lint`実行時に、AMOが新規拡張機能へ要求する`browser_specific_settings.gecko.data_collection_permissions`が必須になった（2025年以降の新要件）ことを確認したため、本アドオンにも追加しています。

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

このキーはFirefox 140以降（Android版は142以降）で対応するため、`strict_min_version`もそれに合わせて`140.0` / `142.0`に設定しています。仕様書の例（`120.0`）より新しいバージョンが必要になっている点に注意してください。

## 開発時の検証（web-ext lint）

```bash
npm install --global web-ext
web-ext lint --source-dir ./tver-speed-firefox
```

`npx web-ext lint --source-dir .`でも実行できます。現時点で **エラー0・警告0** を確認済みです。

## Firefox Androidへのインストール方法

### 方法A：AMOに登録する方法（推奨）

1. [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/)に開発者アカウントでログインする。
2. `tver-speed-firefox`フォルダをZIP化し、アドオンのZIP（またはXPI）としてアップロードする。
3. 自動検証（`web-ext lint`相当）が実行される。
4. 問題がなければ、個人利用目的なら**Unlisted（非公開）**形式を選び署名する。
5. 署名済みアドオン（`.xpi`）をダウンロードし、Firefox Androidから開いて追加する。

一般公開する必要がないため、Listed（公開）形式は使わずUnlistedを優先してください。

### 方法B：Firefox Androidでファイルから追加する方法

方法Aで取得した署名済み`.xpi`ファイルを使います。未署名の自作アドオンはFirefox Android正式版では原則インストールできません。

1. 署名済みの`.xpi`ファイルを端末（Firefox Androidからアクセスできるストレージ）に保存する。
2. Firefox Androidで「設定」→「Firefoxについて」を開く。
3. Firefoxのロゴを5回すばやくタップする（デバッグメニューを有効化）。
4. 設定画面に戻り、「ファイルから拡張機能をインストール」を開く。
5. 保存した`.xpi`ファイルを選択する。
6. 追加確認ダイアログで許可する。
7. アドオン一覧に表示され、有効になっていることを確認する。

## テスト手順

### テスト1：FirefoxでTVerが再生できること

1. Firefox AndroidでTVerを開く。
2. 必要に応じて「PC版サイト」をONにする。
3. 番組ページを開く。
4. 動画がブラウザ内で再生されることを確認する。

### テスト2：アドオンの読み込み

1. Firefoxのアドオン一覧を開く。
2. 「TVer再生速度変更」が表示されることを確認する。
3. アドオンを有効にする。
4. TVerタブを完全に閉じて再度開く。

### テスト3：速度パネル

- [ ] 速度パネルが表示される
- [ ] 1倍から2倍へ変更できる
- [ ] 2倍から3倍へ変更できる
- [ ] 現在速度が表示される
- [ ] 縦画面で画面外にはみ出さない
- [ ] 横画面で動画操作を邪魔しない

### テスト4：再適用

以下の各ケースで保存済み速度が適用されることを確認します。

- [ ] TVerページを再読み込みする
- [ ] 番組を変更する
- [ ] 広告から本編へ切り替える
- [ ] 動画を一時停止して再開する
- [ ] Firefoxを再起動する

### テスト5：ポップアップからの即時反映

- [ ] ポップアップで速度を変更すると、表示中のTVerタブの速度パネルにも即座に反映される
- [ ] 自動適用ON/OFF切り替えが反映される
- [ ] アドオン無効化でパネルが非表示になる

## 動作しない場合の確認

### パネルが表示されない

- アドオンが有効か確認する。
- TVerタブを再読み込みする。
- `content_scripts.matches`が`https://tver.jp/*`と`https://*.tver.jp/*`になっているか確認する。
- `about:debugging#/runtime/this-firefox`（デスクトップ）や`about:devtools-toolbox`でcontent scriptのエラーを確認する。
- content scriptが実行される前にページ遷移していないか確認する。

### パネルは表示されるが速度が変わらない

- video要素の検出数をコンソールログで確認する。
- `video.playbackRate`の値を確認する。
- 広告再生中ではなく本編で試す。
- TVer側が再生開始時に値を戻していないか確認する。
- `MutationObserver`が動作しているか確認する。

### ポップアップから反映されない

- TVerタブがアクティブか確認する。
- ポップアップとTVerタブの両方が同じウィンドウにあるか確認する（`tabs.query({active, currentWindow})`のため）。
- `tabs.sendMessage`の送信先タブでcontent scriptが起動済みか確認する（起動前は`chrome.storage.onChanged`経由でも次回反映される）。

## 既知の制約

- 未署名のアドオンはFirefox Android正式版にインストールできないため、配布・利用にはAMOでの署名が必要です。
- TVer側が`playbackRate`を独自に上書きする実装に変更した場合、追随できなくなる可能性があります。
- `video`要素が別オリジンのiframe内にある場合、content scriptから操作できないことがあります。
- DRMやFirefox Android固有の再生制限がある場合、速度変更以前に再生自体ができないことがあります。この場合は本アドオンの対象外です。
- TVerの仕様変更やFirefox Androidの更新で動作しなくなる可能性があります。
- 広告削除・視聴回数の不正操作・視聴判定の回避・動画ファイル保存・DRM回避機能は実装していません。今後も実装予定はありません。

## 今回作らなかった機能

仕様書のとおり、以下は本移植版に含めていません。

- 広告ブロック
- TVer動画のダウンロード
- TVerアプリの改造・起動
- 視聴回数や視聴判定の操作
- DRM回避
