// 感情の半券 — 画面の小さな動き（JavaScriptなしでもフォームは使えます）
(function () {
  var WORDS = ['', 'とてもつらい', 'つらい', 'しんどい', '少し重い', 'ふつう', 'まあまあ', 'いい感じ', '良い', 'とても良い', '最高'];

  // 気分スライダーの数値と言葉
  document.querySelectorAll('input[type=range]').forEach(function (r) {
    var out = document.querySelector('[data-mood-out="' + r.id + '"]');
    var word = document.querySelector('[data-mood-word="' + r.id + '"]');
    function sync() {
      if (out) out.textContent = r.value + ' / 10';
      if (word) word.textContent = WORDS[r.value] || '';
    }
    r.addEventListener('input', sync);
    sync();
  });

  // 写真のプレビュー
  document.querySelectorAll('input[type=file]').forEach(function (f) {
    var prev = document.querySelector('[data-preview-for="' + f.id + '"]');
    if (!prev) return;
    f.addEventListener('change', function () {
      var file = f.files && f.files[0];
      prev.style.backgroundImage = file ? 'url(' + URL.createObjectURL(file) + ')' : '';
    });
  });

  // 「もう観終わった」で観た後の欄を出す
  var both = document.getElementById('id_both');
  var afterPanel = document.getElementById('after-panel');
  var btn = document.getElementById('submit-btn');
  if (both && afterPanel) {
    var toggle = function () {
      afterPanel.hidden = !both.checked;
      if (btn) btn.textContent = both.checked ? btn.dataset.labelBoth : btn.dataset.labelOne;
    };
    both.addEventListener('change', toggle);
    toggle();
  }

  // 共有設定は選んだらすぐ保存
  document.querySelectorAll('select[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  // 写真が読み込めないときは気持ち（作品は種類）の色で描く
  document.querySelectorAll('.tile img, .cover img, .stub-cover img').forEach(function (img) {
    img.addEventListener('error', function () {
      var t = img.parentNode;
      t.classList.add('emo');
      img.remove();
    });
  });
})();
