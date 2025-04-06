// background.js

// 拡張機能インストール時、enabled 状態が未設定なら初期値を true にする
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("enabled", (result) => {
    if (result.enabled === undefined) {
      chrome.storage.local.set({ enabled: true }, () => {
        // グローバルなアイコン・タイトルを更新（全タブ共通）
        chrome.action.setIcon({ path: "icons/48.png" });
        chrome.action.setTitle({ title: "拡張機能が有効です（クリックで無効化）" });
      });
    } else {
      // 既に設定済みなら、状態に応じたアイコン・タイトルを更新
      const iconPath = result.enabled ? "icons/48.png" : "icons/48-disabled.png";
      const titleText = result.enabled
        ? "拡張機能が有効です（クリックで無効化）"
        : "拡張機能が無効です（クリックで有効化）";
      chrome.action.setIcon({ path: iconPath });
      chrome.action.setTitle({ title: titleText });
    }
  });
});

// アイコンクリック時の処理（onStartup イベントは削除）
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get("enabled", (result) => {
    let enabled = result.enabled;
    if (enabled === undefined) {
      enabled = true;
    }
    // 状態をトグル
    enabled = !enabled;
    chrome.storage.local.set({ enabled: enabled }, () => {
      const iconPath = enabled ? "icons/48.png" : "icons/48-disabled.png";
      const titleText = enabled
        ? "拡張機能が有効です（クリックで無効化）"
        : "拡張機能が無効です（クリックで有効化）";
      // グローバルなアイコン・タイトル更新（タブID指定なしで設定すれば全タブに反映）
      chrome.action.setIcon({ path: iconPath });
      chrome.action.setTitle({ title: titleText });
      // 状態変更直後に現在のタブをリロードして content.js の処理を更新
      chrome.tabs.reload(tab.id);
    });
  });
});
