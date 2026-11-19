/* White Top Up — admin panel logic.
   Login: username + strong password (scrypt-hashed server-side), with a
   one-time recovery code, 5-attempt lockout, and password change. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(s)); };
  var TOKEN_KEY = 'wtu_admin_token';

  var token = localStorage.getItem(TOKEN_KEY) || null;
  var ordersCache = [];
  var statusFilter = '';
  var lockTimer = null;
  var CATEGORY_LABELS = {
    diamond: 'ডায়মন্ড', deshioffer: 'দেশি অফার', membership: 'মেম্বারশিপ',
    weeklylite: 'Weekly Lite', levelup: 'Level Up Pass', likes: 'Likes',
    likeoffer: 'Like Offer', mysterybox: 'Mystery Box',
  };
  var ERR_BN = {
    invalid_username: 'Username ৪–২০ অক্ষর — শুধু a–z, 0–9, _ আর -',
    password_too_short: 'Password কমপক্ষে ৮ অক্ষরের হতে হবে',
    password_too_long: 'Password অনেক বড় হয়ে গেছে',
    password_weak: 'Password এ অক্ষর (A–Z) + সংখ্যা (0–9) দুটোই থাকতে হবে',
    wrong_credentials: 'Username বা Password ভুল',
    wrong_recovery_code: 'Recovery code ভুল',
    wrong_password: 'বর্তমান Password ভুল',
    already_set_up: 'অ্যাকাউন্ট আগেই বানানো হয়েছে — লগইন করো',
    not_set_up: 'অ্যাকাউন্ট এখনো বানানো হয়নি',
    too_many_attempts: 'অনেকবার ভুল হয়েছে — একটু পর চেষ্টা করো',
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

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.add('show');
  }
  function hideError(el) { el.classList.remove('show'); }

  /* ---- auth screens ---- */
  var AUTH_SCREENS = ['login', 'setup', 'recovery', 'forgot'];
  function showScreen(name) {
    AUTH_SCREENS.forEach(function (n) {
      $('#auth' + n.charAt(0).toUpperCase() + n.slice(1)).style.display = n === name ? '' : 'none';
    });
    $('#authWrap').style.display = '';
    $('#adminApp').style.display = 'none';
  }

  function showApp() {
    $('#authWrap').style.display = 'none';
    $('#adminApp').style.display = '';
    loadDashboard();
  }

  function clearLockout() {
    if (lockTimer) { clearInterval(lockTimer); lockTimer = null; }
    $('#lockNote').style.display = 'none';
    $('#loginBtn').disabled = false;
  }

  function showLockout(lockedUntil) {
    var btn = $('#loginBtn');
    btn.disabled = true;
    function tick() {
      var left = Math.max(0, lockedUntil - Date.now());
      if (left <= 0) { clearLockout(); return; }
      var mins = Math.floor(left / 60000);
      var secs = Math.floor((left % 60000) / 1000);
      $('#lockNote').textContent = '🔒 অ্যাকাউন্ট লক হয়ে গেছে — ' +
        (mins > 0 ? mins + ' মিনিট ' : '') + secs + ' সেকেন্ড পর আবার চেষ্টা করো';
      $('#lockNote').style.display = '';
    }
    tick();
    if (lockTimer) clearInterval(lockTimer);
    lockTimer = setInterval(tick, 1000);
  }

  /* ---- password rules (mirror the server) ---- */
  function usernameError(u) {
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(u)) return ERR_BN.invalid_username;
    return '';
  }
  function passwordError(pw) {
    if (!pw || pw.length < 8) return ERR_BN.password_too_short;
    if (pw.length > 128) return ERR_BN.password_too_long;
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return ERR_BN.password_weak;
    return '';
  }
  function passwordScore(pw) {
    var s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  function updateStrengthMeter() {
    var pw = $('#setupPass').value;
    var score = passwordScore(pw);
    var fill = $('#pwMeterFill');
    var label = $('#pwMeterLabel');
    fill.style.width = (score / 5 * 100) + '%';
    if (!pw) { label.textContent = ''; fill.style.background = 'var(--red)'; }
    else if (score <= 2) { label.textContent = 'দুর্বল'; label.style.color = '#B91C1C'; fill.style.background = '#B91C1C'; }
    else if (score <= 3) { label.textContent = 'মাঝারি'; label.style.color = '#D97706'; fill.style.background = '#F59E0B'; }
    else { label.textContent = 'শক্তিশালী ✓'; label.style.color = 'var(--green)'; fill.style.background = 'var(--green)'; }
    $('#ruleLen').classList.toggle('ok', pw.length >= 8);
    $('#ruleLetter').classList.toggle('ok', /[A-Za-z]/.test(pw));
    $('#ruleDigit').classList.toggle('ok', /\d/.test(pw));
    $('#ruleSymbol').classList.toggle('ok', /[^A-Za-z0-9]/.test(pw));
  }
  $('#setupPass').addEventListener('input', updateStrengthMeter);

  /* show/hide password toggles */
  $$('.pw-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-for'));
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? '🙈' : '👁️';
    });
  });

  /* ---- boot ---- */
  api('/api/admin/auth-status')
    .then(function (res) {
      var d = res.data || {};
      if (res.status !== 200 || !d.setup) { showScreen('setup'); return; }
      if (d.locked) showLockout(d.lockedUntil);
      if (token) {
        api('/api/admin/orders').then(function (res2) {
          if (res2.status === 200) { ordersCache = res2.data.orders || []; showApp(); }
          else { token = null; localStorage.removeItem(TOKEN_KEY); showScreen('login'); }
        });
      } else { showScreen('login'); }
    })
    .catch(function () {
      showScreen('login');
      showError($('#loginError'), 'সার্ভারের সাথে যোগাযোগ হচ্ছে না');
    });

  /* ---- setup form ---- */
  $('#setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var errEl = $('#setupError');
    hideError(errEl);
    var username = $('#setupUser').value.trim();
    var pw = $('#setupPass').value;
    var uErr = usernameError(username);
    if (uErr) { showError(errEl, uErr); return; }
    var pErr = passwordError(pw);
    if (pErr) { showError(errEl, pErr); return; }
    if (pw !== $('#setupConfirm').value) { showError(errEl, 'দুটো Password মিলছে না'); return; }
    $('#setupBtn').disabled = true;
    api('/api/admin/setup', { method: 'POST', body: JSON.stringify({ username: username, password: pw }) })
      .then(function (res) {
        $('#setupBtn').disabled = false;
        if (res.status === 200 && res.data.token && res.data.recoveryCode) {
          token = res.data.token;
          localStorage.setItem(TOKEN_KEY, token);
          $('#recoveryCodeText').textContent = res.data.recoveryCode;
          showScreen('recovery');
        } else if (res.status === 403) { showScreen('login'); }
        else { showError(errEl, ERR_BN[res.data.error] || 'অ্যাকাউন্ট বানানো যায়নি — আবার চেষ্টা করো'); }
      });
  });

  /* ---- recovery code screen ---- */
  $('#recoveryCopyBtn').addEventListener('click', function () {
    var code = $('#recoveryCodeText').textContent;
    function done() { toast('Recovery code copy হয়েছে'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, done);
    } else { done(); }
  });
  $('#recoveryDoneBtn').addEventListener('click', function () {
    toast('Admin অ্যাকাউন্ট তৈরি হয়েছে');
    showApp();
  });

  /* ---- login form ---- */
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var errEl = $('#loginError');
    hideError(errEl);
    var username = $('#loginUser').value.trim();
    var pw = $('#loginPass').value;
    if (!username || !pw) { showError(errEl, 'Username আর Password দুটোই দাও'); return; }
    $('#loginBtn').disabled = true;
    api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: username, password: pw }) })
      .then(function (res) {
        if (res.status === 200 && res.data.token) {
          token = res.data.token;
          localStorage.setItem(TOKEN_KEY, token);
          clearLockout();
          showApp();
          return;
        }
        $('#loginBtn').disabled = false;
        if (res.status === 423 && res.data.lockedUntil) { showLockout(res.data.lockedUntil); }
        else if (res.status === 403) { showScreen('setup'); }
        else if (res.status === 401 && res.data.attemptsLeft !== undefined) {
          showError(errEl, 'Username বা Password ভুল — আর ' + res.data.attemptsLeft + ' বার চেষ্টা করা যাবে');
        }
        else { showError(errEl, ERR_BN[res.data.error] || 'লগইন হয়নি — আবার চেষ্টা করো'); }
      });
  });

  /* ---- forgot password ---- */
  $('#forgotLink').addEventListener('click', function () {
    hideError($('#forgotError'));
    showScreen('forgot');
  });
  $('#backToLogin').addEventListener('click', function () { showScreen('login'); });
  $('#forgotForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var errEl = $('#forgotError');
    hideError(errEl);
    var code = $('#forgotCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var pw = $('#forgotPass').value;
    if (code.length !== 16) { showError(errEl, 'Recovery code ১৬ অক্ষরের হতে হবে'); return; }
    var pErr = passwordError(pw);
    if (pErr) { showError(errEl, pErr); return; }
    if (pw !== $('#forgotConfirm').value) { showError(errEl, 'দুটো Password মিলছে না'); return; }
    $('#forgotBtn').disabled = true;
    api('/api/admin/recover', { method: 'POST', body: JSON.stringify({ code: code, password: pw }) })
      .then(function (res) {
        $('#forgotBtn').disabled = false;
        if (res.status === 200) {
          clearLockout();
          toast('Password বদলে গেছে — নতুন password দিয়ে লগইন করো');
          showScreen('login');
        } else { showError(errEl, ERR_BN[res.data.error] || 'হয়নি — আবার চেষ্টা করো'); }
      });
  });

  /* ---- nav ---- */
  function switchView(view) {
    $$('.tab-link[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    $$('.view').forEach(function (v) { v.style.display = 'none'; });
    $('#view-' + view).style.display = '';
    if (view === 'dashboard') loadDashboard();
    if (view === 'orders') loadOrders();
    if (view === 'packages') loadPackages();
    if (view === 'settings') loadSettings();
  }
  $$('.tab-link[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); });
  });
  $$('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.getAttribute('data-goto')); });
  });

  $('#logoutBtn').addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST' });
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    showScreen('login');
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

  /* ---- change password ---- */
  $('#changePwForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var errEl = $('#pwChangeError');
    var msgEl = $('#pwChangeMsg');
    hideError(errEl);
    msgEl.textContent = '';
    var current = $('#pwCurrent').value;
    var pw = $('#pwNew').value;
    if (!current) { showError(errEl, 'বর্তমান Password দাও'); return; }
    var pErr = passwordError(pw);
    if (pErr) { showError(errEl, pErr); return; }
    if (pw !== $('#pwNewConfirm').value) { showError(errEl, 'দুটো নতুন Password মিলছে না'); return; }
    api('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, password: pw }) })
      .then(function (res) {
        if (res.status === 200) {
          msgEl.textContent = '✅ Password বদলে গেছে';
          toast('Password বদলে গেছে');
          $('#pwCurrent').value = '';
          $('#pwNew').value = '';
          $('#pwNewConfirm').value = '';
        } else { showError(errEl, ERR_BN[res.data.error] || 'হয়নি — আবার চেষ্টা করো'); }
      });
  });
})();
