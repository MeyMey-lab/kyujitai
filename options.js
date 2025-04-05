// options.js

document.addEventListener('DOMContentLoaded', restoreOptions);

// debounce 関数：短時間に連続する変更をまとめて保存する
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// 保存処理：各チェックボックスの状態を保存
function saveOptions() {
  const convertOldToNew = document.getElementById('convertOldToNew').checked;
  const convertFormToOld = document.getElementById('convertFormToOld').checked;
  const convertCopyToNew = document.getElementById('convertCopyToNew').checked;
  const avoidCompatibility = document.getElementById('avoidCompatibility').checked;

  chrome.storage.local.set({
    convertOldToNew,
    convertFormToOld,
    convertCopyToNew,
    avoidCompatibility
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('保存エラー:', chrome.runtime.lastError);
    } else {
      console.log('設定が自動保存されました。');
    }
  });
}

// 復元処理：保存済みの設定を読み込み、チェック状態に反映
function restoreOptions() {
  chrome.storage.local.get(['convertOldToNew', 'convertFormToOld', 'convertCopyToNew', 'avoidCompatibility'], (result) => {
    document.getElementById('convertOldToNew').checked = result.convertOldToNew || false;
    document.getElementById('convertFormToOld').checked = result.convertFormToOld || false;
    document.getElementById('convertCopyToNew').checked = result.convertCopyToNew || false;
    document.getElementById('avoidCompatibility').checked = result.avoidCompatibility || false;
    console.log('設定が復元されました:', result);
  });
}

// フォーム内の全てのチェックボックスに対して自動保存イベントを設定
const formElements = document.querySelectorAll('#options-form input[type="checkbox"]');
const debouncedSaveOptions = debounce(saveOptions, 500);

formElements.forEach(el => {
  el.addEventListener('change', debouncedSaveOptions);
});
