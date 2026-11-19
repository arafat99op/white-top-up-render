/* White Top Up — shop frontend logic. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(s)); };

  var state = {
    packages: [],
    settings: null,
    filter: 'diamond',
    selectedId: null,
    method: null,
  };

  var METHOD_LABELS = { bkash: 'bKash', nagad: 'Nagad' };
  var CATEGORY_LABELS = {
    diamond: 'ডায়মন্ড', deshioffer: 'দেশি অফার', membership: 'মেম্বারশিপ',
    weeklylite: 'Weekly Lite', levelup: 'Level Up Pass', likes: 'Likes',
    likeoffer: 'Like Offer', mysterybox: 'Mystery Box',
  };
  var CATEGORY_NOTES = {
    diamond: 'ID Code টপ আপ — শুধু UID দিলেই হবে, পাসওয়ার্ড লাগে না।',
    deshioffer: 'দেশি অফার — প্রতি UID-তে লিমিট আছে: Monthly / Weekly সর্বোচ্চ ১ বার (৭ দিনে), Weekly Lite সর্বোচ্চ ৫ বার (২ দিনে)।',
    membership: 'মেম্বারশিপ অ্যাক্টিভ হলে প্রতিদিন লগইন করে ডায়মন্ড ক্লেইম করতে হয়।',
    weeklylite: 'ছোট মেম্বারশিপ — কম দামে প্রতিদিন ডায়মন্ড।',
    levelup: 'লেভেল অনুযায়ী রিওয়ার্ড আনলক হয় — প্যাকেজ কিনলেই অ্যাক্টিভ।',
    likes: 'লাইক সরাসরি তোমার Free Fire প্রোফাইলে যাবে।',
    likeoffer: 'প্রতিদিন ২০০ লাইক — প্যাকেজের মেয়াদ অনুযায়ী।',
    mysterybox: 'সারপ্রাইজ গিফট বক্স — ভেতরে কী আছে জানতে কিনে দেখো!',
  };
  var CATEGORY_ICONS = {
    deshioffer: '🇧🇩', membership: '📅', weeklylite: '💠', levelup: '⭐',
    likes: '❤️', likeoffer: '🔥', mysterybox: '🎁',
  };
  var COMBO_NAME = 'Weekly + Monthly Combo';

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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

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

  /* ---- marquee: fixed 5-item repeating ticker ---- */
  function buildMarquee(notice) {
    var items = [
      '⚡ কনফার্ম হলেই ১–৫ মিনিটে ডেলিভারি',
      '💳 bKash • Nagad পেমেন্ট',
      '🔒 শুধু UID দিলেই হবে — পাসওয়ার্ড লাগে না',
      notice,
      '🎧 বাংলায় সাপোর্ট 9AM–12AM',
    ];
    var group = items.map(function (t) { return '<span>' + escapeHtml(t) + '</span>'; }).join('');
    $('#marqueeTrack').innerHTML = group + group;
  }
  buildMarquee('White Top Up — Free Fire Diamond Top Up BD');

  /* ---- render ---- */
  function renderCatNote() {
    $('#catNote').textContent = CATEGORY_NOTES[state.filter] || '';
  }

  function renderPackages() {
    var grid = $('#pkgGrid');
    var list = state.packages.filter(function (p) { return p.category === state.filter; });
    if (!list.length) {
      grid.innerHTML = '<p style="color:var(--dim);grid-column:1/-1">এই ক্যাটাগরিতে এখন কোনো প্যাকেজ নেই।</p>';
      return;
    }
    grid.innerHTML = list.map(function (p) {
      var badge = p.badge ? '<span class="pkg-badge">' + escapeHtml(p.badge) + '</span>' : '';
      var sel = p.id === state.selectedId ? ' selected' : '';
      var old = p.oldPrice ? '<span class="old">' + money(p.oldPrice) + '</span>' : '';
      var note = p.note ? '<div class="pkg-note">' + escapeHtml(p.note) + '</div>' : '<div class="pkg-note"></div>';
      // Mystery Box: gift icon + the price as the big figure (no invented contents).
      if (p.category === 'mysterybox') {
        return '<button type="button" class="pkg-card pkg-mystery spotlight-card pressable' + sel + '" data-id="' + p.id + '">' +
          badge + '<div class="pkg-gift">🎁</div>' +
          '<div class="pkg-name">' + escapeHtml(p.name) + '</div>' + note +
          '<div class="pkg-price">' + money(p.price) + old + '</div></button>';
      }
      // Diamond packs: big diamond number + per-diamond rate.
      if (p.category === 'diamond' && p.diamonds) {
        var per = (p.price / p.diamonds).toFixed(2);
        return '<button type="button" class="pkg-card spotlight-card pressable' + sel + '" data-id="' + p.id + '">' +
          badge + '<div class="pkg-diamonds">' + p.diamonds.toLocaleString('en-US') + ' <span class="gem">💎</span></div>' +
          '<div class="pkg-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="pkg-per">প্রতি ডায়মন্ড ≈ ৳' + per + '</div>' +
          '<div class="pkg-price">' + money(p.price) + old + '</div></button>';
      }
      // Everything else: category icon + name + its own subtitle.
      var icon = CATEGORY_ICONS[p.category] || '💎';
      return '<button type="button" class="pkg-card spotlight-card pressable' + sel + '" data-id="' + p.id + '">' +
        badge + '<div class="pkg-icon">' + icon + '</div>' +
        '<div class="pkg-name">' + escapeHtml(p.name) + '</div>' + note +
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
    if (!state.settings || !state.method) return '01xxxxxxxx';
    var key = 'pay' + state.method.charAt(0).toUpperCase() + state.method.slice(1);
    return state.settings[key] || '01xxxxxxxx';
  }

  function updateSummary() {
    var pkg = selectedPkg();
    var uid = $('#uidInput').value.trim();
    $('#sumUid').textContent = uid || '—';
    $('#sumPkg').textContent = pkg ? pkg.name : 'প্যাকেজ বেছে নাও';
    $('#sumTotal').textContent = pkg ? money(pkg.price) : '৳0';
    $('#orderBtn').textContent = pkg ? 'Order Now — ' + money(pkg.price) : 'Order Now';
    if (state.method) {
      $('#receiveNumber').textContent = receiveNumber();
      $('#receiveLabel').textContent = 'এই ' + METHOD_LABELS[state.method] + ' নম্বরে' +
        (pkg ? ' ' + money(pkg.price) : '') + ' Send Money করো';
    }
  }

  function applySettings() {
    var s = state.settings;
    if (!s) return;
    buildMarquee(s.notice || 'White Top Up — Free Fire Diamond Top Up BD');
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

  /* ---- load storefront ---- */
  fetch((window.API_BASE || '') + '/api/storefront')
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
  function setFilter(cat) {
    state.filter = cat;
    $$('#segControl .seg-btn').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-filter') === cat ? 'true' : 'false');
    });
    renderCatNote();
    renderPackages();
  }
  $$('#segControl .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setFilter(btn.getAttribute('data-filter')); });
  });

  /* ---- menu tiles + footer quick links ---- */
  function gotoCategory(cat) {
    setFilter(cat);
    document.getElementById('packages').scrollIntoView({ behavior: 'smooth' });
  }
  $$('#menuTiles .tile').forEach(function (tile) {
    tile.addEventListener('click', function () { gotoCategory(tile.getAttribute('data-category')); });
  });
  $$('.foot-cat').forEach(function (btn) {
    btn.addEventListener('click', function () { gotoCategory(btn.getAttribute('data-category')); });
  });

  /* ---- combo banner: select the combo package ---- */
  $('#comboBtn').addEventListener('click', function () {
    var combo = state.packages.find(function (p) { return p.name === COMBO_NAME; });
    setFilter('membership');
    state.selectedId = combo ? combo.id : 23;
    renderPackages();
    updateSummary();
    document.getElementById('packages').scrollIntoView({ behavior: 'smooth' });
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

  /* ---- payment methods (none pre-selected) ---- */
  $$('#payGrid .pay-card').forEach(function (card) {
    card.addEventListener('click', function () {
      $$('#payGrid .pay-card').forEach(function (c) {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      state.method = card.getAttribute('data-method');
      $('#payError').classList.remove('show');
      $('#payDetails').style.display = '';
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
    if (!state.method) { $('#payError').classList.add('show'); ok = false; }
    if (!/^[A-Za-z0-9]{6,30}$/.test(trx)) { $('#trxError').classList.add('show'); ok = false; }
    if (!ok) return;

    var btn = $('#orderBtn');
    btn.disabled = true;
    btn.textContent = 'অর্ডার হচ্ছে...';
    fetch((window.API_BASE || '') + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: pkg.id, playerUid: uid, paymentMethod: state.method, trxId: trx }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        updateSummary();
        if (res.status !== 200 || !res.data.code) {
          // Show the server's message when it has one (e.g. Deshi Offer limit).
          toast(res.data.message || 'অর্ডার হয়নি — আবার চেষ্টা করো');
          return;
        }
        $('#orderCode').textContent = res.data.code;
        $('#summaryBox').style.display = 'none';
        $('#successBox').classList.add('show');
        $('#trxInput').value = '';
        $('#trackInput').value = res.data.code;
        $('#successBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackOrder(res.data.code);
      })
      .catch(function () {
        btn.disabled = false;
        updateSummary();
        toast('নেটওয়ার্ক সমস্যা — আবার চেষ্টা করো');
      });
  });
  $('#trxInput').addEventListener('input', function () { $('#trxError').classList.remove('show'); });

  /* ---- new order: restore the summary ---- */
  $('#newOrderBtn').addEventListener('click', function () {
    state.selectedId = null;
    $('#successBox').classList.remove('show');
    $('#summaryBox').style.display = '';
    $('#trxInput').value = '';
    renderPackages();
    updateSummary();
    document.getElementById('packages').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---- track order ---- */
  var STATUS_BN = { pending: 'Pending — যাচাই চলছে', confirmed: 'Confirmed — পেমেন্ট মিলেছে', delivered: 'Delivered ✅', rejected: 'Rejected' };
  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(iso || '').slice(0, 10); }
  }
  function trackOrder(code) {
    code = (code || $('#trackInput').value || '').trim().toUpperCase();
    if (!code) return;
    fetch((window.API_BASE || '') + '/api/orders/' + encodeURIComponent(code))
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
        $('#trDate').textContent = o.createdAt ? formatDate(o.createdAt) : '—';
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
  renderCatNote();
  updateSummary();
})();
