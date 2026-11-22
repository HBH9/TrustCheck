/* TrustCheck on Supabase.
 * Gives the TrustCheck page the same data interface it uses on claude.ai
 * (window.claude.use('db') / use('user')), backed by a Supabase project.
 * Every visitor gets an anonymous Supabase account automatically, so anyone
 * can register a business or send a report without signing up.
 * The reviewer page (reviewer.html) asks for the reviewer's email and password.
 * The database's row level security (setup.sql) decides who may read and write.
 */
(function () {
  'use strict';
  var cfg = window.TC_CONFIG || {};
  var PAGE = window.TC_PAGE === 'reviewer' ? 'reviewer' : 'public';
  var URL0 = String(cfg.url || '').replace(/\/+$/, '');
  var KEY = String(cfg.anonKey || '');
  var POLL = Math.max(3000, Number(cfg.pollMs) || 5000);
  var STORE = 'tc.session.' + PAGE;           // the public site and the reviewer page keep separate sign-ins
  window.TC_HOSTED = true;

  // sections that only make sense on claude.ai
  var st = document.createElement('style');
  st.textContent = '[data-rc=import],[data-rc=settings]{display:none!important}' +
    '.tc-login{position:fixed;inset:0;z-index:95;background:var(--paper,#f5f4ef);display:grid;place-items:center;padding:20px;overflow:auto}' +
    '.tc-login form{width:min(440px,100%);display:grid;gap:14px;padding:28px;border-radius:26px;background:#fff;box-shadow:0 0 0 1px rgba(15,15,14,.08),0 30px 60px -40px rgba(15,15,14,.5)}' +
    '.tc-login .top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '.tc-login .brand{display:flex;align-items:center;gap:8px;font:900 20px/1 var(--display,sans-serif);letter-spacing:-.03em;text-transform:uppercase}' +
    '.tc-login .brand svg{width:18px;height:20px}' +
    '.tc-login h1{margin:6px 0 0;font:900 40px/.92 var(--display,sans-serif);letter-spacing:-.045em;text-transform:uppercase}' +
    '.tc-login label{font-weight:600;font-size:13.5px}' +
    '.tc-login a{font-size:13.5px;color:#4a4945}' +
    '.tc-setup{position:fixed;left:16px;right:16px;bottom:16px;z-index:96;padding:14px 16px;border-radius:14px;background:#fbe0da;color:#8a2a18;font:600 14px/1.45 Inter,sans-serif;box-shadow:0 10px 30px -15px rgba(0,0,0,.4)}';
  document.head.appendChild(st);

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function configured() { return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL0) && KEY.length > 40; }

  /* ---------------- auth (Supabase Auth REST API) ---------------- */
  var session = null;
  function loadSession() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) { return null; } }
  function saveSession(s) { session = s; try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch (_) {} }
  function fromAuthResponse(j) {
    if (!j || !j.access_token || !j.user) return null;
    return { access_token: j.access_token, refresh_token: j.refresh_token,
             expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)),
             user: { id: j.user.id, email: j.user.email || '', is_anonymous: !!j.user.is_anonymous } };
  }
  async function authCall(path, body) {
    var r = await fetch(URL0 + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    var j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw err(r.status === 400 || r.status === 422 ? 'auth' : 'unavailable', (j && (j.msg || j.error_description || j.message)) || ('HTTP ' + r.status));
    return j;
  }
  async function refresh() {
    if (!session || !session.refresh_token) return null;
    try { saveSession(fromAuthResponse(await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token }))); }
    catch (e) { if (e.code === 'auth') saveSession(null); else throw e; }
    return session;
  }
  async function token() {
    if (session && session.expires_at - 60 < Date.now() / 1000) await refresh();
    return session ? session.access_token : KEY;
  }
  async function signInAnonymously() { saveSession(fromAuthResponse(await authCall('signup', { data: {} }))); return session; }
  async function signInWithPassword(email, password) { saveSession(fromAuthResponse(await authCall('token?grant_type=password', { email: email, password: password }))); return session; }

  /* ---------------- data (Supabase REST API on the docs table) ---------------- */
  async function rest(method, query, body, prefer) {
    var tk = await token(), h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (session) h.Authorization = 'Bearer ' + tk;      // signed in (anonymously or as reviewer); otherwise the key alone means "anon"
    if (prefer) h.Prefer = prefer;
    var r = await fetch(URL0 + '/rest/v1/' + query, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401 && session) { await refresh(); if (session) h.Authorization = 'Bearer ' + (await token()); else delete h.Authorization;
      r = await fetch(URL0 + '/rest/v1/' + query, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
    var text = await r.text(), j = null; try { j = text ? JSON.parse(text) : null; } catch (_) {}
    if (!r.ok) {
      var m = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
      if (r.status === 401 || r.status === 403 || (j && (j.code === '42501' || j.code === '23514'))) throw err('invalid_argument', m);
      if (r.status === 413) throw err('invalid_argument', m);
      throw err('unavailable', m);
    }
    return j;
  }
  var enc = function (v) { return encodeURIComponent(v); };
  var clone = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
  var META = { fromCache: false, hasPendingWrites: false };
  function snapDoc(path, row) {
    var ok = !!row;
    return { id: path.split('/').pop(), exists: ok, data: function () { return ok ? clone(row.data) : undefined; }, metadata: META };
  }
  async function readDoc(path) { var rows = await rest('GET', 'docs?select=path,data&path=eq.' + enc(path)); return rows && rows[0] || null; }
  async function readCol(c) { return (await rest('GET', 'docs?select=path,data&collection=eq.' + enc(c) + '&order=path.asc')) || []; }

  var pollers = new Set();
  function kick() { pollers.forEach(function (f) { f(); }); }
  function watch(load, make, next, error) {
    var last = null, dead = false, fails = 0;
    var run = async function () {
      if (dead) return;
      try { var v = await load(); fails = 0; var k = JSON.stringify(v); if (k !== last) { last = k; next(make(v)); } }
      catch (e) { if (e.code === 'invalid_argument' && error && ++fails > 2) { dead = true; error(e); } }
    };
    run(); var t = setInterval(run, POLL); pollers.add(run);
    return function () { dead = true; clearInterval(t); pollers.delete(run); };
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path: path,
      get: async function () { return snapDoc(path, await readDoc(path)); },
      set: async function (data) { await rest('POST', 'docs?on_conflict=path', { path: path, data: data, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal'); kick(); },
      update: async function (data) { var cur = await readDoc(path); if (!cur) throw err('invalid_argument', 'missing document');
        await this.set(Object.assign({}, cur.data, data)); },
      delete: async function () { await rest('DELETE', 'docs?path=eq.' + enc(path), undefined, 'return=minimal'); kick(); },
      onSnapshot: function (next, error) { return watch(function () { return readDoc(path); }, function (row) { return snapDoc(path, row); }, next, error); },
      collection: function (p) { return colRef(path + '/' + p); }
    };
  }
  function colRef(c) {
    return {
      path: c,
      doc: function (id) { return docRef(c + '/' + (id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)))); },
      get: async function () { var rows = await readCol(c); var docs = rows.map(function (r) { return snapDoc(r.path, r); }); return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: META }; },
      onSnapshot: function (next, error) {
        return watch(function () { return readCol(c); }, function (rows) { var docs = rows.map(function (r) { return snapDoc(r.path, r); }); return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: META }; }, next, error);
      }
    };
  }
  var db = { doc: docRef, collection: colRef };

  /* ---------------- reviewer sign-in screen ---------------- */
  var SHIELD = '<svg viewBox="0 0 24 27" aria-hidden="true"><path d="M12 0 0 4.5V12c0 7.5 5.2 12.6 12 15 6.8-2.4 12-7.5 12-15V4.5z" fill="currentColor"/><path d="m6.5 13.5 4 4 7.5-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function showLogin(message) {
    return new Promise(function () {
      var go = function () {
        var box = document.createElement('div'); box.className = 'tc-login';
        box.innerHTML = '<form novalidate><div class="top"><span class="brand">' + SHIELD + 'TrustCheck</span><span class="rc-tag">Reviewer console</span></div>' +
          '<h1>Reviewer sign&nbsp;in</h1><p class="vsub" style="margin:0">Only TrustCheck reviewers can open this page.</p>' +
          '<label for="tcEmail">Email</label><input class="inp" id="tcEmail" type="email" autocomplete="username" required>' +
          '<label for="tcPass">Password</label><input class="inp" id="tcPass" type="password" autocomplete="current-password" required>' +
          '<p class="err" id="tcErr"' + (message ? '' : ' hidden') + '></p>' +
          '<button class="btn" type="submit">Sign in</button><a href="./">Go to the public TrustCheck site</a></form>';
        document.body.appendChild(box);
        if (message) box.querySelector('#tcErr').textContent = message;
        box.querySelector('form').addEventListener('submit', async function (e) {
          e.preventDefault(); var b = box.querySelector('button'), er = box.querySelector('#tcErr'); er.hidden = true; b.disabled = true;
          try { await signInWithPassword(box.querySelector('#tcEmail').value.trim(), box.querySelector('#tcPass').value); location.reload(); }
          catch (x) { er.textContent = x.code === 'auth' ? 'Wrong email or password.' : "Can't reach the database right now. Try again."; er.hidden = false; b.disabled = false; }
        });
        setTimeout(function () { var i = box.querySelector('#tcEmail'); i && i.focus(); }, 50);
      };
      if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    });
  }
  function addSignOut() {
    var add = function () {
      var top = document.querySelector('.rc-top'); if (!top || top.querySelector('.tc-out')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost tc-out'; b.textContent = 'Sign out'; b.style.marginLeft = '0';
      b.onclick = function () { saveSession(null); location.reload(); };
      top.appendChild(b);
      var pub = document.getElementById('rcPublic');
      if (pub) pub.onclick = function () { location.href = './'; };
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  }
  function setupNotice(text) {
    var go = function () { var d = document.createElement('div'); d.className = 'tc-setup'; d.textContent = text; document.body.appendChild(d); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  /* ---------------- start ---------------- */
  var isReviewer = false;
  var ready = (async function () {
    if (!configured()) { setupNotice('TrustCheck is not connected to its database yet. Put your Supabase Project URL and anon key in config.js.'); return false; }
    session = loadSession();
    if (session && session.expires_at - 60 < Date.now() / 1000) { try { await refresh(); } catch (_) {} }
    if (PAGE === 'reviewer') {
      if (!session || session.user.is_anonymous) return showLogin();
      try { isReviewer = !!(await rest('POST', 'rpc/is_reviewer', {})); } catch (_) { isReviewer = false; }
      if (!isReviewer) { saveSession(null); return showLogin('This account is not a TrustCheck reviewer. Ask the project owner to add its email to the reviewers list.'); }
      addSignOut();
      return true;
    }
    if (!session) {
      try { await signInAnonymously(); }
      catch (e) { setupNotice("Can't save requests right now: anonymous sign-ins are turned off in Supabase (Authentication > Sign In / Providers)."); return false; }
    }
    return true;
  })();

  var user = {
    id: async function () { return session ? session.user.id : null; },
    canEdit: async function () { return PAGE === 'reviewer' && isReviewer; },
    isOwner: async function () { return PAGE === 'reviewer' && isReviewer; },
    can: async function (n) { return n === 'data.write' ? !!session : false; },
    me: async function () { return { id: session ? session.user.id : null, name: '', avatarUrl: '', color: '#888', email: null, isOwner: isReviewer, canEdit: isReviewer }; },
    profiles: async function (ids) { var o = {}; (ids || []).forEach(function (i) { o[i] = { id: i, name: '' }; }); return o; }
  };
  window.claude = {
    use: async function (name) {
      var ok = false; try { ok = await ready; } catch (_) { ok = false; }
      if (!ok) return null;
      return name === 'db' ? db : name === 'user' ? user : null;
    }
  };
})();
