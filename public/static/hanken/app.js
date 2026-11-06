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

  // 写真を送る前にブラウザで縮小する：向きを直し、長辺を data-max-side px 以下の JPEG にする。
  // うまくいかないとき（古いブラウザなど）は元の写真のまま送り、サーバー側で10MBまで受け付ける。
  function shrink(file, side) {
    if (!window.createImageBitmap || !window.DataTransfer || !/^image\//.test(file.type)) return Promise.resolve(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // 透明な部分は白に
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (bmp.close) bmp.close();
      return new Promise(function (ok) {
        canvas.toBlob(function (blob) {
          ok(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.85);
      });
    }).catch(function () { return file; });
  }

  var pending = 0;
  function setBusy(form, busy) {
    if (!form) return;
    form.querySelectorAll('button[type=submit]').forEach(function (b) { b.disabled = busy; });
  }

  document.querySelectorAll('input[type=file]').forEach(function (f) {
    var prev = document.querySelector('[data-preview-for="' + f.id + '"]');
    var side = Number(f.dataset.maxSide) || 1280;
    f.addEventListener('change', function () {
      var file = f.files && f.files[0];
      if (prev) prev.style.backgroundImage = file ? 'url(' + URL.createObjectURL(file) + ')' : '';
      if (!file) return;
      pending++;
      setBusy(f.form, true);
      shrink(file, side).then(function (small) {
        if (small !== file && f.files && f.files[0] === file) {
          var dt = new DataTransfer();
          dt.items.add(small);
          f.files = dt.files;
        }
      }).finally(function () {
        if (--pending === 0) setBusy(f.form, false);
      });
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
