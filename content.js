// content.js

// 初期設定（デフォルト値）
let settings = {
  convertOldToNew: false,    // 「元から旧字体の場合は新字体に変換する」
  convertFormToOld: false,   // 「フォームに入力したテキストを旧字体に変換する」
  convertCopyToNew: false,   // 「テキストを選択してコピーした場合新字体に戻す」
  avoidCompatibility: false  // 「CJK互換漢字を使わない」
};

// 逆変換用辞書の生成（初期化時に一度だけ実行）
const reverseReplacements = {};
const reverseIdioms = {};

function buildReverseDictionaries() {
  // 単漢字の逆引き生成
  if (typeof replacements !== 'undefined') {
    for (const [newChar, oldChar] of Object.entries(replacements)) {
      if (newChar !== oldChar) {
        reverseReplacements[oldChar] = newChar;
      }
    }
  }
  // 条件付き変換の逆引き生成（瓣, 辨, 辯 -> 弁 など多対一の対応を吸収）
  if (typeof conditionalReplacements !== 'undefined') {
    for (const [newChar, conditions] of Object.entries(conditionalReplacements)) {
      for (const cond of conditions) {
        if (cond.replacement !== newChar) {
          reverseReplacements[cond.replacement] = newChar;
        }
      }
    }
  }
  // 熟語変換の逆引き生成
  if (typeof idiomReplacements !== 'undefined') {
    for (const [newIdiom, oldIdiom] of Object.entries(idiomReplacements)) {
      if (newIdiom !== oldIdiom) {
        reverseIdioms[oldIdiom] = newIdiom;
      }
    }
  }
}

chrome.storage.local.get(
  ['convertOldToNew', 'convertFormToOld', 'convertCopyToNew', 'avoidCompatibility'],
  (result) => {
    settings.convertOldToNew = result.convertOldToNew || false;
    settings.convertFormToOld = result.convertFormToOld || false;
    settings.convertCopyToNew = result.convertCopyToNew || false;
    settings.avoidCompatibility = result.avoidCompatibility || false;
    
    buildReverseDictionaries();
    initContentScript();
  }
);

/**
 * CJK互換漢字かどうか判定する関数
 */
function isCJKCompatibility(ch) {
  const cp = ch.codePointAt(0);
  if (!cp) return false;
  return (cp >= 0x3400 && cp <= 0x4DBF) ||      // CJK統合漢字拡張A
         (cp >= 0x20000 && cp <= 0x2A6DF) ||    // CJK統合漢字拡張B
         (cp >= 0x2A700 && cp <= 0x2B73F) ||    // CJK統合漢字拡張C
         (cp >= 0x2B740 && cp <= 0x2B81F) ||    // CJK統合漢字拡張D
         (cp >= 0x2B820 && cp <= 0x2CEAF) ||    // CJK統合漢字拡張E
         (cp >= 0xF900 && cp <= 0xFAFF);        // CJK互換漢字
}

/**
 * テキスト全体の変換処理（正順・逆順を一元管理）
 * @param {string} text - 変換対象の文字列
 * @param {boolean} toOld - true: 新→旧 / false: 旧→新
 */
function convertText(text, toOld) {
  if (!text || !/[\u4E00-\u9FFF]/.test(text)) return text;

  let result = text;
  const targetIdioms = toOld ? idiomReplacements : reverseIdioms;

  // ① 熟語の変換（最長一致の観点から文字単位ループの前に一括置換）
  if (typeof targetIdioms !== 'undefined') {
    for (const [key, val] of Object.entries(targetIdioms)) {
      if (settings.avoidCompatibility && isCJKCompatibility(val)) continue;
      // indexOfによる事前判定でsplit/joinの不要な実行コストを削減
      if (result.includes(key)) {
        result = result.split(key).join(val);
      }
    }
  }

  // ② 文字単位の変換（文脈条件付き対応）
  let finalResult = "";
  for (let i = 0; i < result.length; i++) {
    let char = result[i];
    let prev = i > 0 ? result[i - 1] : "";
    let next = i < result.length - 1 ? result[i + 1] : "";
    let swapped = char;

    if (toOld) {
      let replacedByCondition = false;
      if (typeof conditionalReplacements !== 'undefined' && conditionalReplacements[char]) {
        for (let candidate of conditionalReplacements[char]) {
          if (candidate.condition(prev, next)) {
            swapped = candidate.replacement;
            replacedByCondition = true;
            break;
          }
        }
      }
      if (!replacedByCondition && typeof replacements !== 'undefined' && replacements[char]) {
        swapped = replacements[char];
      }
    } else {
      // 逆変換（旧→新）
      if (reverseReplacements[char]) {
        swapped = reverseReplacements[char];
      }
    }

    if (settings.avoidCompatibility && isCJKCompatibility(swapped)) {
      swapped = char;
    }
    finalResult += swapped;
  }
  
  return finalResult;
}

/**
 * TextNodeに対する置換処理
 */
function handleText(textNode) {
  const originalText = textNode.nodeValue;
  const toOld = !settings.convertOldToNew; // convertOldToNewがfalseなら新→旧
  const convertedText = convertText(originalText, toOld);
  
  // DOMの再描画コスト削減とMutationObserverの無限ループ防止
  if (originalText !== convertedText) {
    textNode.nodeValue = convertedText;
  }
}

/**
 * DOM内のテキストノードを再帰的に走査する関数
 */
function walk(node) {
  let child, next;
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
    case Node.DOCUMENT_NODE:
    case Node.DOCUMENT_FRAGMENT_NODE:
      // スクリプトやスタイルの内部は無視
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') {
        break;
      }
      child = node.firstChild;
      while (child) {
        next = child.nextSibling;
        walk(child);
        child = next;
      }
      break;
    case Node.TEXT_NODE:
      handleText(node);
      break;
  }
}

/**
 * 入力フォームのカーソル位置を保持しながら変換するラッパー
 */
function handleInputConversion(el) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const originalVal = el.value;
  const convertedVal = convertText(originalVal, true); // フォーム入力は旧字体に変換

  if (originalVal !== convertedVal) {
    el.value = convertedVal;
    // value書き換えによるカーソルの末尾ジャンプを防止
    if (document.activeElement === el) {
      el.setSelectionRange(start, end);
    }
  }
}

/**
 * メイン初期化関数
 */
function initContentScript() {
  chrome.storage.local.get("enabled", (result) => {
    const enabled = (result.enabled === undefined) ? true : result.enabled;
    if (!enabled) return;

    // (1) ページ全体に対して置換処理を実施
    walk(document.body);
    
    // MutationObserver により、動的に追加されたノードも対象
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          walk(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // (2) コピー時に新字体へ戻す機能
    if (settings.convertCopyToNew) {
      document.addEventListener('copy', function(e) {
        const selection = window.getSelection().toString();
        if (selection) {
          const converted = convertText(selection, false); // false = 旧→新
          e.clipboardData.setData('text/plain', converted);
          e.preventDefault();
        }
      });
    }
    
    // (3) フォーム入力の変換処理
    if (settings.convertFormToOld) {
      // イベントデリゲーションを利用して動的追加されたフォーム要素にも対応
      let composing = false;
      document.body.addEventListener('compositionstart', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') composing = true;
      });
      document.body.addEventListener('compositionend', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          composing = false;
          handleInputConversion(e.target);
        }
      });
      document.body.addEventListener('input', (e) => {
        if (!composing && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
          handleInputConversion(e.target);
        }
      });
    }

    // (4) プレースホルダーの置換
    replacePlaceholders();
  });
}

function replacePlaceholders() {
  const elems = document.querySelectorAll('[placeholder]');
  const toOld = !settings.convertOldToNew;
  elems.forEach(elem => {
    let ph = elem.getAttribute('placeholder');
    if (ph) {
      const converted = convertText(ph, toOld);
      if (ph !== converted) elem.setAttribute('placeholder', converted);
    }
  });
}
