/* White Top Up — admin panel logic. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(s)); };
  var TOKEN_KEY = 'wtu_admin_token';

  var token = localStorage.getItem(TOKEN_KEY) || null;
  var pinIsSetup = false;
  var ordersCache = [];
  var statusFilter = '';
  var CATEGORY_LABELS = {
    diamond: 'ডায়মন্ড', deshioffer: 'দেশি অফার', membership: 'মেম্বারশিপ',
    weeklylite: 'Weekly Lite', levelup: 'Level Up Pass', likes: 'Likes',
    likeoffer: 'Like Offer', mysterybox: 'Mystery Box',
  };

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function money(n) { return '৳' + Number(n).toLocaleString('en-US'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function showApp() {
    $('#pinWrap').style.display = 'none';
    $('#adminApp').style.display = '';
    loadDashboard();
  }

  function showPin(isSetup) {
    pinIsSetup = isSetup;
    $('#pinWrap').style.display = '';
    $('#adminApp').style.display = 'none';
    $('#pinSub').textContent = isSetup
      ? 'প্রথমবার — একটা PIN সেট করো (৪–১২ সংখ্যা)'
      : 'PIN দিয়ে লগইন করো';
    $('#pinConfirmField').style.display = isSetup ? '' : 'none';
    $('#pinBtn').textContent = isSetup ? 'PIN সেট করো' : 'লগইন';
    $('#pinInput').value = '';
    $('#pinConfirm').value = '';
  }

  function pinError(msg) {
    var el = $('#pinError');
    el.textContent = msg;
    el.classList.add('show');
  }

  /* ---- boot ---- */
  fetch('/api/admin/pin-status')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.pinSet) { showPin(true); return; }
      if (token) {
        // Verify the stored token still works.
        api('/api/admin/orders').then(function (res) {
          if (res.status === 200) { ordersCache = res.data.orders || []; showApp(); }
          else { token = null; localStorage.removeItem(TOKEN_KEY); showPin(false); }
        });
      } else { showPin(false); }
    })
    .catch(function () { pinError('সার্ভারের সাথে যোগাযোগ হচ্ছে না'); });

  /* ---- PIN form ---- */
  $('#pinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pin = $('#pinInput').value.trim();
    $('#pinError').classList.remove('show');
    if (!/^\d{4,12}$/.test(pin)) { pinError('PIN ৪–১২ সংখ্যার হতে হবে'); return; }
    if (pinIsSetup) {
      if (pin !== $('#pinConfirm').value.trim()) { pinError('দুটো PIN মিলছে না'); return; }
      api('/api/admin/setup-pin', { method: 'POST', body: JSON.stringify({ pin: pin }) })
        .then(function (res) {
          if (res.status === 200 && res.data.token) {
            token = res.data.token;
            localStorage.setItem(TOKEN_KEY, token);
            toast('PIN সেট হয়েছে');
            showApp();
          } else { pinError('PIN সেট করা যায়নি — আবার চেষ্টা করো'); }
        });
    } else {
      api('/api/admin/login', { method: 'POST', body: JSON.stringify({ pin: pin }) })
        .then(function (res) {
          if (res.status === 200 && res.data.token) {
            token = res.data.token;
            localStorage.setItem(TOKEN_KEY, token);
            showApp();
          } else if (res.status === 429) { pinError('অনেকবার ভুল হয়েছে — ৫ মিনিট পর চেষ্টা করো'); }
          else { pinError('ভুল PIN'); }
        });
    }
  });

  /* ---- nav ---- */
  function switchView(view) {
    $$('.side-link[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    $$('.view').forEach(function (v) { v.style.display = 'none'; });
    $('#view-' + view).style.display = '';
    var titles = { dashboard: 'Dashboard', orders: 'Orders', packages: 'Packages', settings: 'Settings' };
    $('#viewTitle').textContent = titles[view] || '';
    $('.sidebar').classList.remove('open');
    if (view === 'dashboard') loadDashboard();
    if (view === 'orders') loadOrders();
    if (view === 'packages') loadPackages();
    if (view === 'settings') loadSettings();
  }
  $$('.side-link[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); });
  });
  $$('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.getAttribute('data-goto')); });
  });
  $('#menuBtn').addEventListener('click', function () { $('.sidebar').classList.toggle('open'); });

  $('#logoutBtn').addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST' });
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    showPin(false);
  });

  /* ---- dashboard ---- */
  function loadDashboard() {
    api('/api/admin/orders').then(function (res) {
      if (res.status !== 200) return;
      ordersCache = res.data.orders || [];
      var c = res.data.counts || {};
      $('#statPending').textContent = c.pending || 0;
      $('#statConfirmed').textContent = c.confirmed || 0;
      $('#statDelivered').textContent = c.delivered || 0;
      $('#statRejected').textContent = c.rejected || 0;
      $('#statTotal').textContent = c.total || 0;
      $('#statRevenue').textContent = money(res.data.deliveredRevenue || 0);
      var badge = $('#pendingBadge');
      if (c.pending > 0) { badge.textContent = c.pending; badge.style.display = ''; }
      else badge.style.display = 'none';
      var recent = ordersCache.slice(0, 5);
      $('#recentOrders').innerHTML = recent.length
        ? recent.map(orderRowHtml).join('')
        : '<p class="muted">কোনো অর্ডার নেই এখনো।</p>';
      bindOrderButtons($('#recentOrders'));
    });
  }

  /* ---- orders ---- */
  var STATUS_BN = { pending: 'Pending', confirmed: 'Confirmed', delivered: 'Delivered', rejected: 'Rejected' };
  function orderRowHtml(o) {
    var date = new Date(o.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return '<div class="order-card" data-id="' + escapeHtml(o.code) + '">' +
      '<div class="order-top"><span class="order-code">' + escapeHtml(o.code) + '</span>' +
      '<span class="status-pill st-' + o.status + '">' + STATUS_BN[o.status] + '</span>' +
      '<strong>' + money(o.price) + '</strong></div>' +
      '<div class="order-meta"><span>📦 ' + escapeHtml(o.packageName) + '</span>' +
      '<span>🆔 UID: ' + escapeHtml(o.playerUid) + '</span>' +
      '<span>💳 ' + escapeHtml(o.paymentMethod) + '</span>' +
      '<span>🔑 TrxID: ' + escapeHtml(o.trxId) + '</span>' +
      '<span>🕐 ' + escapeHtml(date) + '</span></div>' +
      (o.note ? '<div class="order-meta"><span>📝 ' + escapeHtml(o.note) + '</span></div>' : '') +
      '<div class="order-actions">' +
      '<input class="input note-input" type="text" placeholder="নোট (optional)" value="' + escapeHtml(o.note || '') + '" maxlength="300">' +
      '<button class="btn btn-blue btn-sm pressable" data-status="confirmed" type="button">Confirm</button>' +
      '<button class="btn btn-green btn-sm pressable" data-status="delivered" type="button">Delivered</button>' +
      '<button class="btn btn-outline btn-sm pressable" data-status="pending" type="button">Pending</button>' +
      '<button class="btn btn-outline btn-sm pressable" data-status="rejected" type="button">Reject</button>' +
      '</div></div>';
  }

  function bindOrderButtons(scope) {
    $$('.order-card button[data-status]', scope).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.order-card');
        var id = card.getAttribute('data-id');
        var note = card.querySelector('.note-input').value;
        var status = btn.getAttribute('data-status');
        btn.disabled = true;
        api('/api/admin/orders/' + id + '/status', {
          method: 'POST', body: JSON.stringify({ status: status, note: note }),
        }).then(function (res) {
          btn.disabled = false;
          if (res.status === 200) {
            toast('অর্ডার ' + STATUS_BN[status] + ' হয়েছে');
            loadOrders();
            loadDashboard();
          } else toast('স্ট্যাটাস বদলানো যায়নি');
        });
      });
    });
  }

  function loadOrders() {
    var q = $('#orderSearch').value.trim();
    var url = '/api/admin/orders?status=' + encodeURIComponent(statusFilter) + '&q=' + encodeURIComponent(q);
    api(url).then(function (res) {
      if (res.status !== 200) return;
      var list = res.data.orders || [];
      $('#orderList').innerHTML = list.length
        ? list.map(orderRowHtml).join('')
        : '<p class="muted">কোনো অর্ডার পাওয়া যায়নি।</p>';
      bindOrderButtons($('#orderList'));
    });
  }
  var searchTimer = null;
  $('#orderSearch').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadOrders, 300);
  });
  $$('#statusFilter .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('#statusFilter .seg-btn').forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      statusFilter = btn.getAttribute('data-status');
      loadOrders();
    });
  });

  /* ---- packages ---- */
  function loadPackages() {
    api('/api/admin/packages').then(function (res) {
      if (res.status !== 200) return;
      var list = res.data.packages || [];
      $('#pkgList').innerHTML = list.map(function (p) {
        return '<div class="pkg-row" data-id="' + p.id + '">' +
          '<div class="field"><label>নাম <span class="muted">(' + escapeHtml(CATEGORY_LABELS[p.category] || p.category) + ')</span></label><input class="input f-name" type="text" value="' + escapeHtml(p.name) + '"></div>' +
          '<div class="field"><label>দাম (৳)</label><input class="input f-price" type="number" min="0" value="' + p.price + '"></div>' +
          '<div class="field"><label>ডায়মন্ড (খালি = নাই)</label><input class="input f-dia" type="number" min="0" value="' + (p.diamonds == null ? '' : p.diamonds) + '"></div>' +
          '<div class="field"><label>ব্যাজ</label><input class="input f-badge" type="text" value="' + escapeHtml(p.badge || '') + '" placeholder="যেমন: Popular"></div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
          '<label class="check-row"><input type="checkbox" class="f-active"' + (p.active ? ' checked' : '') + '> Active</label>' +
          '<button class="btn btn-dark btn-sm pressable pkg-save" type="button">Save</button>' +
          '</div></div>';
      }).join('');
      $$('#pkgList .pkg-save').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('.pkg-row');
          var payload = {
            id: Number(row.getAttribute('data-id')),
            name: row.querySelector('.f-name').value.trim(),
            price: Number(row.querySelector('.f-price').value),
            diamonds: row.querySelector('.f-dia').value === '' ? null : Number(row.querySelector('.f-dia').value),
            badge: row.querySelector('.f-badge').value.trim(),
            active: row.querySelector('.f-active').checked,
          };
          btn.disabled = true;
          api('/api/admin/packages', { method: 'POST', body: JSON.stringify(payload) })
            .then(function (res) {
              btn.disabled = false;
              if (res.status === 200) toast('প্যাকেজ save হয়েছে');
              else toast('Save হয়নি — দাম/নাম চেক করো');
            });
        });
      });
    });
  }

  /* ---- settings ---- */
  function loadSettings() {
    api('/api/admin/settings').then(function (res) {
      if (res.status !== 200) return;
      var s = res.data.settings || {};
      $('#setBkash').value = s.payBkash || '';
      $('#setNagad').value = s.payNagad || '';
      $('#setWhatsapp').value = s.whatsapp || '';
      $('#setTelegram').value = s.telegram || '';
      $('#setFacebook').value = s.facebook || '';
      $('#setNotice').value = s.notice || '';
      $('#setDelivery').value = s.deliveryNote || '';
      $('#setLeakKey').value = '';
      $('#setLeakKey').placeholder = res.data.hasLeakApiKey
        ? 'API key set করা আছে — বদলাতে নতুন key লিখো'
        : 'API key বসাও';
      $('#setClearKey').checked = false;
    });
  }
  $('#settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {
      payBkash: $('#setBkash').value.trim(),
      payNagad: $('#setNagad').value.trim(),
      whatsapp: $('#setWhatsapp').value.trim(),
      telegram: $('#setTelegram').value.trim(),
      facebook: $('#setFacebook').value.trim(),
      notice: $('#setNotice').value.trim(),
      deliveryNote: $('#setDelivery').value.trim(),
      leakApiKey: $('#setLeakKey').value.trim(),
      clearLeakApiKey: $('#setClearKey').checked,
    };
    $('#settingsMsg').textContent = 'Save হচ্ছে...';
    api('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (res) {
        if (res.status === 200) {
          $('#settingsMsg').textContent = '✅ Save হয়েছে';
          toast('Settings save হয়েছে');
          loadSettings();
        } else { $('#settingsMsg').textContent = 'Save হয়নি'; }
      });
  });
})();
