// content.js

// 初期設定（デフォルト値）
let settings = {
  convertOldToNew: false,    // 「元から旧字体の場合は新字体に変換する」
  convertFormToOld: false,   // 「フォームに入力したテキストを旧字体に変換する」
  convertCopyToNew: false,   // 「テキストを選択してコピーした場合新字体に戻す」
  avoidCompatibility: false  // 「CJK互換漢字を使わない」
};

// chrome.storage.local から設定を読み込む
chrome.storage.local.get(
  ['convertOldToNew', 'convertFormToOld', 'convertCopyToNew', 'avoidCompatibility'],
  (result) => {
    settings.convertOldToNew = result.convertOldToNew || false;
    settings.convertFormToOld = result.convertFormToOld || false;
    settings.convertCopyToNew = result.convertCopyToNew || false;
    settings.avoidCompatibility = result.avoidCompatibility || false;
    // 設定読み込み完了後に初期化
    initContentScript();
  }
);

// data.js で定義された新→旧の変換辞書（replacements）を元に、逆変換（旧→新）の辞書を生成
const reverseReplacements = {};
for (const key in replacements) {
  if (replacements.hasOwnProperty(key)) {
    reverseReplacements[replacements[key]] = key;
  }
}

/**
 * CJK互換漢字かどうか判定する関数
 * Unicodeの範囲 U+F900～U+FAFF を対象とする
 */
function isCJKCompatibility(ch) {
  const cp = ch.codePointAt(0);
  return (cp >= 0x3400 && cp <= 0x4DBF) ||     // CJK統合漢字拡張A
         (cp >= 0x20000 && cp <= 0x2A6DF) ||   // CJK統合漢字拡張B
         (cp >= 0x2A700 && cp <= 0x2B73F) ||   // CJK統合漢字拡張C
         (cp >= 0x2B740 && cp <= 0x2B81F) ||   // CJK統合漢字拡張D
         (cp >= 0x2B820 && cp <= 0x2CEAF) ||   // CJK統合漢字拡張E
         (cp >= 0xF900 && cp <= 0xFAFF);        // CJK互換漢字
}

/**
 * 条件付き変換のチェックや通常の変換を行う関数
 * settings.convertOldToNew が true の場合は、旧字体なら新字体に戻す（reverseReplacements を使用）
 * また、settings.avoidCompatibility が true の場合、変換結果が CJK互換漢字なら変換を行わず元の文字を返す
 */
function getReplacement(char, prev, next) {
  if (settings.convertOldToNew) {
    // トグル動作：もし旧字体なら新字体に、もし新字体なら旧字体に変換する
    let swapped = char;
    if (reverseReplacements[char]) {
      swapped = reverseReplacements[char];
    } else if (replacements[char]) {
      swapped = replacements[char];
    }
    if (settings.avoidCompatibility && isCJKCompatibility(swapped)) {
      return char;
    }
    return swapped;
  } else {
    // convertOldToNew が無効の場合は、これまでの処理（条件付きや通常の new→old 変換）を実施
    if (conditionalReplacements && conditionalReplacements[char]) {
      for (let candidate of conditionalReplacements[char]) {
        if (candidate.condition(prev, next)) {
          if (settings.avoidCompatibility && isCJKCompatibility(candidate.replacement)) {
            return char;
          }
          return candidate.replacement;
        }
      }
    }
    if (replacements[char]) {
      let newChar = replacements[char];
      if (settings.avoidCompatibility && isCJKCompatibility(newChar)) {
        return char;
      }
      return newChar;
    }
    return char;
  }
}


/**
 * 熟語変換（idiomReplacements）の適用
 * idiomReplacements は「新熟語:旧熟語」の形式で定義されている前提
 */
function replaceIdioms(text) {
  if (typeof idiomReplacements !== 'undefined') {
    for (const idiom in idiomReplacements) {
      if (idiomReplacements.hasOwnProperty(idiom)) {
        // 置換結果が CJK互換漢字なら変換をスキップ
        const replacement = idiomReplacements[idiom];
        if (settings.avoidCompatibility && isCJKCompatibility(replacement)) {
          continue;
        }
        text = text.split(idiom).join(replacement);
      }
    }
  }
  return text;
}

/**
 * 新→旧の変換を、文字単位で実施（熟語変換を先行して適用）
 */
function handleText(textNode) {
  let text = textNode.nodeValue;
  if (!/[\u4E00-\u9FFF]/.test(text)) return;
  
  // ① 熟語変換を先行して適用
  text = replaceIdioms(text);
  
  // ② 各文字について変換（前後の文脈を考慮）
  let result = "";
  for (let i = 0; i < text.length; i++) {
    let current = text[i];
    let prev = i > 0 ? text[i - 1] : "";
    let next = i < text.length - 1 ? text[i + 1] : "";
    result += getReplacement(current, prev, next);
  }
  textNode.nodeValue = result;
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
 * メイン初期化関数
 */
function initContentScript() {
  // ページ全体（head と body）に対して置換処理を実施
  walk(document.head);
  walk(document.body);
  
  // MutationObserver により、動的に追加されたノードも対象
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        walk(node);
      });
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // (3) コピー時に新字体へ戻す機能の設定
  if (settings.convertCopyToNew) {
    document.addEventListener('copy', function(e) {
      const selection = window.getSelection().toString();
      let converted = "";
      for (let char of selection) {
        // reverseReplacements により、旧字体なら新字体に戻す
        converted += reverseReplacements[char] || char;
      }
      e.clipboardData.setData('text/plain', converted);
      e.preventDefault();
    });
  }
  
  // (2) フォーム入力の変換処理
  if (settings.convertFormToOld) {
    const formElements = document.querySelectorAll("input[type='text'], textarea");
    formElements.forEach(el => {
      let composing = false;
      el.addEventListener('compositionstart', () => {
        composing = true;
      });
      el.addEventListener('compositionend', () => {
        composing = false;
        // 組成終了後に変換処理を実行する
        el.value = convertNewToOld(el.value);
      });
      el.addEventListener('input', () => {
        // 組成中は変換せず、組成終了後に変換されるようにする
        if (!composing) {
          el.value = convertNewToOld(el.value);
        }
      });
    });
  }
  replacePlaceholders();
}

/**
 * 旧→新の変換（フォーム入力用など）を、文字単位で実施
 * ※通常は getReplacement を利用しますが、フォーム入力は全体の文字列に対して変換する
 */
function convertNewToOld(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    let current = text[i];
    let prev = i > 0 ? text[i - 1] : "";
    let next = i < text.length - 1 ? text[i + 1] : "";
    result += getReplacement(current, prev, next);
  }
  return result;
}

// プレースホルダー初回変換
function replacePlaceholders() {
  const elems = document.querySelectorAll('[placeholder]');
  elems.forEach(elem => {
    let ph = elem.getAttribute('placeholder');
    // convertNewToOld は既存の旧→新（またはその逆）の変換関数
    ph = convertNewToOld(ph);
    elem.setAttribute('placeholder', ph);
  });
}

