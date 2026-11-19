/* White Top Up — shop frontend logic. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(s)); };

  var state = {
    packages: [],
    settings: null,
    filter: 'all',
    selectedId: null,
    method: 'bkash',
  };

  var METHOD_LABELS = { bkash: 'bKash', nagad: 'Nagad' };
  var CATEGORY_LABELS = {
    diamond: 'ডায়মন্ড', deshioffer: 'দেশি অফার', membership: 'মেম্বারশিপ',
    weeklylite: 'Weekly Lite', levelup: 'Level Up Pass', likes: 'Likes',
    likeoffer: 'Like Offer', mysterybox: 'Mystery Box',
  };

  /* ---- digit conversion: Bangla / Arabic-Indic -> English ---- */
  function toEnglishDigits(s) {
    return String(s || '')
      .replace(/[০-৯]/g, function (d) { return String(d.charCodeAt(0) - 0x09e6); })
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06f0); });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function money(n) { return '৳' + Number(n).toLocaleString('en-US'); }

  /* ---- spotlight hover ---- */
  function bindSpotlight(scope) {
    $$('.spotlight-card', scope).forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--spot-x', (e.clientX - r.left) + 'px');
        el.style.setProperty('--spot-y', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---- render ---- */
  function renderPackages() {
    var grid = $('#pkgGrid');
    var list = state.packages.filter(function (p) {
      return state.filter === 'all' || p.category === state.filter;
    });
    if (!list.length) {
      grid.innerHTML = '<p style="color:var(--dim);grid-column:1/-1">এই ক্যাটাগরিতে এখন কোনো প্যাকেজ নেই।</p>';
      return;
    }
    grid.innerHTML = list.map(function (p) {
      var badge = p.badge ? '<span class="pkg-badge">' + escapeHtml(p.badge) + '</span>' : '';
      var sel = p.id === state.selectedId ? ' selected' : '';
      var old = p.oldPrice ? '<span class="old">' + money(p.oldPrice) + '</span>' : '';
      // Mystery Box: gift icon + the price as the big figure (no invented contents).
      if (p.category === 'mysterybox') {
        var note = p.note ? '<div class="pkg-note">' + escapeHtml(p.note) + '</div>' : '<div class="pkg-note"></div>';
        return '<button type="button" class="pkg-card pkg-mystery spotlight-card pressable' + sel + '" data-id="' + p.id + '">' +
          badge + '<div class="pkg-gift">🎁</div>' +
          '<div class="pkg-name">' + escapeHtml(p.name) + '</div>' + note +
          '<div class="pkg-price">' + money(p.price) + old + '</div></button>';
      }
      var dia = p.diamonds
        ? '<div class="pkg-diamonds">' + p.diamonds.toLocaleString('en-US') + ' <span class="gem">💎</span></div>'
        : '<div class="pkg-diamonds">' + escapeHtml(CATEGORY_LABELS[p.category] || '') + '</div>';
      var note2 = p.note ? '<div class="pkg-note">' + escapeHtml(p.note) + '</div>' : '<div class="pkg-note"></div>';
      return '<button type="button" class="pkg-card spotlight-card pressable' + sel + '" data-id="' + p.id + '">' +
        badge + dia +
        '<div class="pkg-name">' + escapeHtml(p.name) + '</div>' + note2 +
        '<div class="pkg-price">' + money(p.price) + old + '</div></button>';
    }).join('');
    $$('#pkgGrid .pkg-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.selectedId = Number(card.getAttribute('data-id'));
        $('#pkgError').classList.remove('show');
        renderPackages();
        updateSummary();
      });
    });
    bindSpotlight(grid);
  }

  function selectedPkg() {
    return state.packages.find(function (p) { return p.id === state.selectedId; }) || null;
  }

  function receiveNumber() {
    if (!state.settings) return '01xxxxxxxx';
    var key = 'pay' + state.method.charAt(0).toUpperCase() + state.method.slice(1);
    return state.settings[key] || '01xxxxxxxx';
  }

  function updateSummary() {
    var pkg = selectedPkg();
    var uid = $('#uidInput').value.trim();
    $('#sumUid').textContent = uid || '—';
    $('#sumPkg').textContent = pkg ? pkg.name : 'প্যাকেজ বেছে নাও';
    $('#sumPay').textContent = METHOD_LABELS[state.method];
    $('#sumTotal').textContent = pkg ? money(pkg.price) : '৳0';
    $('#receiveNumber').textContent = receiveNumber();
    $('#receiveLabel').textContent = 'এই ' + METHOD_LABELS[state.method] + ' নম্বরে টাকা পাঠাও (Send Money)';
  }

  function applySettings() {
    var s = state.settings;
    if (!s) return;
    var notice = s.notice || 'White Top Up — Free Fire Diamond Top Up BD';
    var track = $('#marqueeTrack');
    track.innerHTML = '<span>' + escapeHtml(notice) + '</span><span>' + escapeHtml(notice) + '</span>';
    if (s.deliveryNote) {
      $('#deliveryNoteHero').textContent = s.deliveryNote;
      $('#deliveryNoteSum').textContent = s.deliveryNote;
    }
    var wa = $('#waLink'), tg = $('#tgLink'), waHead = $('#waHeaderBtn');
    if (s.whatsapp) {
      wa.href = s.whatsapp; wa.style.display = '';
      waHead.href = s.whatsapp; waHead.style.display = '';
    } else { wa.style.display = 'none'; waHead.style.display = 'none'; }
    if (s.telegram) { tg.href = s.telegram; tg.style.display = ''; } else { tg.style.display = 'none'; }
    updateSummary();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- load storefront ---- */
  fetch('/api/storefront')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.packages = data.packages || [];
      state.settings = data.settings || null;
      renderPackages();
      applySettings();
    })
    .catch(function () {
      $('#pkgGrid').innerHTML = '<p style="color:var(--red);grid-column:1/-1">প্যাকেজ লোড করা যায়নি — পেজটা রিফ্রেশ করো।</p>';
    });

  /* ---- UID input ---- */
  var uidInput = $('#uidInput');
  uidInput.addEventListener('input', function () {
    var v = toEnglishDigits(uidInput.value).replace(/\D/g, '').slice(0, 15);
    if (v !== uidInput.value) uidInput.value = v;
    $('#uidError').classList.remove('show');
    updateSummary();
  });

  /* ---- category filter ---- */
  $$('#segControl .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('#segControl .seg-btn').forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      state.filter = btn.getAttribute('data-filter');
      renderPackages();
    });
  });

  /* ---- menu tiles ---- */
  $$('#menuTiles .tile').forEach(function (tile) {
    tile.addEventListener('click', function () {
      var cat = tile.getAttribute('data-category');
      state.filter = cat;
      $$('#segControl .seg-btn').forEach(function (b) {
        b.setAttribute('aria-selected', b.getAttribute('data-filter') === cat ? 'true' : 'false');
      });
      renderPackages();
      document.getElementById('packages').scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ---- 3D tilt on menu tiles (mouse only; flat on touch) ---- */
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    $$('#menuTiles .tile').forEach(function (tile) {
      tile.addEventListener('mousemove', function (e) {
        var r = tile.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        tile.style.setProperty('--ry', (px * 10).toFixed(1) + 'deg');
        tile.style.setProperty('--rx', (-py * 10).toFixed(1) + 'deg');
      });
      tile.addEventListener('mouseleave', function () {
        tile.style.setProperty('--rx', '0deg');
        tile.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---- payment methods ---- */
  $$('#payGrid .pay-card').forEach(function (card) {
    card.addEventListener('click', function () {
      $$('#payGrid .pay-card').forEach(function (c) {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      state.method = card.getAttribute('data-method');
      updateSummary();
    });
  });

  /* ---- copy receive number ---- */
  $('#copyBtn').addEventListener('click', function () {
    var num = receiveNumber();
    function done() { toast('নম্বর কপি হয়েছে'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(num).then(done, function () { fallbackCopy(num); done(); });
    } else { fallbackCopy(num); done(); }
  });
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---- place order ---- */
  $('#orderBtn').addEventListener('click', function () {
    var uid = toEnglishDigits(uidInput.value).replace(/\D/g, '');
    var pkg = selectedPkg();
    var trx = $('#trxInput').value.trim();
    var ok = true;
    if (!/^\d{5,15}$/.test(uid)) { $('#uidError').classList.add('show'); ok = false; }
    if (!pkg) { $('#pkgError').classList.add('show'); ok = false; }
    if (!/^[A-Za-z0-9]{6,30}$/.test(trx)) { $('#trxError').classList.add('show'); ok = false; }
    if (!ok) return;

    var btn = $('#orderBtn');
    btn.disabled = true;
    btn.textContent = 'অর্ডার হচ্ছে...';
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: pkg.id, playerUid: uid, paymentMethod: state.method, trxId: trx }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = 'Order Now';
        if (res.status !== 200 || !res.data.code) {
          // Show the server's message when it has one (e.g. Deshi Offer limit).
          toast(res.data.message || 'অর্ডার হয়নি — আবার চেষ্টা করো');
          return;
        }
        $('#orderCode').textContent = res.data.code;
        $('#successBox').classList.add('show');
        $('#trxInput').value = '';
        $('#trackInput').value = res.data.code;
        $('#successBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackOrder(res.data.code);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Order Now';
        toast('নেটওয়ার্ক সমস্যা — আবার চেষ্টা করো');
      });
  });
  $('#trxInput').addEventListener('input', function () { $('#trxError').classList.remove('show'); });

  /* ---- track order ---- */
  var STATUS_BN = { pending: 'Pending — যাচাই চলছে', confirmed: 'Confirmed — পেমেন্ট মিলেছে', delivered: 'Delivered ✅', rejected: 'Rejected' };
  function trackOrder(code) {
    code = (code || $('#trackInput').value || '').trim().toUpperCase();
    if (!code) return;
    fetch('/api/orders/' + encodeURIComponent(code))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        if (res.status !== 200 || !res.data.order) {
          $('#trackError').classList.add('show');
          $('#trackResult').classList.remove('show');
          return;
        }
        $('#trackError').classList.remove('show');
        var o = res.data.order;
        $('#trCode').textContent = o.code;
        $('#trPkg').textContent = o.packageName;
        $('#trTotal').textContent = money(o.price);
        var pill = $('#trStatus');
        pill.className = 'status-pill st-' + o.status;
        pill.textContent = STATUS_BN[o.status] || o.status;
        var order = ['pending', 'confirmed', 'delivered'];
        var idx = order.indexOf(o.status);
        $$('#trTimeline .tl-step').forEach(function (step, i) {
          step.classList.toggle('done', o.status !== 'rejected' && i <= idx);
        });
        $('#trTimeline').style.display = o.status === 'rejected' ? 'none' : 'flex';
        $('#trackResult').classList.add('show');
      })
      .catch(function () { toast('নেটওয়ার্ক সমস্যা — আবার চেষ্টা করো'); });
  }
  $('#trackBtn').addEventListener('click', function () { trackOrder(); });
  $('#trackInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') trackOrder(); });

  /* ---- FAQ ---- */
  $$('.faq-q').forEach(function (q) {
    q.addEventListener('click', function () {
      q.parentElement.classList.toggle('open');
    });
  });

  bindSpotlight(document);
  updateSummary();
})();
