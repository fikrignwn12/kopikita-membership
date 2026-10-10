/* KopiKita - logika bersama (versi Supabase) */
(function (w) {
  'use strict';

  var TIERS = [
    { key: 'silver', name: 'Silver', min: 0, disc: 10, rate: 10, perks: [
      'Diskon 10% semua menu', '10 poin per Rp10.000', 'Akses promo member', 'Gratis espresso saat ulang tahun'] },
    { key: 'gold', name: 'Gold', min: 500, disc: 20, rate: 12, perks: [
      'Diskon 20% semua menu', '12 poin per Rp10.000', 'Voucher gratis 1 menu per bulan',
      'Prioritas tempat duduk', 'Ulang tahun: diskon 30% + gratis cake'] },
    { key: 'platinum', name: 'Platinum', min: 1500, disc: 30, rate: 15, perks: [
      'Diskon 30% semua menu', '15 poin per Rp10.000', 'Voucher gratis 2 menu per bulan',
      'Reservasi premium dan area VIP', 'Ulang tahun: diskon 50% + gratis set menu',
      'Akses lebih awal ke menu terbatas'] }
  ];

  /* ---------- Konfigurasi & klien Supabase ---------- */
  var cfg = w.KK_CONFIG || {};
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf('GANTI') === -1 && cfg.SUPABASE_ANON_KEY.indexOf('GANTI') === -1);
  var sb = null;
  function client() {
    if (sb) return sb;
    if (!configured) throw new Error('CONFIG');
    if (!w.supabase) throw new Error('OFFLINE');
    sb = w.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return sb;
  }
  async function rpc(fn, args) {
    var r = await client().rpc(fn, args || {});
    if (r.error) throw r.error;
    return r.data;
  }

  var MESSAGES = {
    CONFIG: 'Situs belum terhubung ke database. Isi config.js dengan URL dan kunci anon Supabase.',
    OFFLINE: 'Pustaka Supabase belum termuat. Periksa koneksi internet lalu muat ulang halaman.',
    NAMA_INVALID: 'Nama harus 2 sampai 40 karakter.',
    HP_INVALID: 'Nomor HP harus 9 sampai 15 angka.',
    HP_EXISTS: 'Nomor HP ini sudah terdaftar.',
    ID_FULL: 'Pendaftaran sedang penuh. Hubungi kasir.',
    FORBIDDEN: 'Akun ini tidak punya akses kasir.',
    AMOUNT_INVALID: 'Total belanja harus antara Rp1.000 dan Rp100.000.000.',
    NOT_FOUND: 'Member tidak ditemukan.'
  };
  function errText(e) {
    var m = (e && e.message) || '';
    for (var k in MESSAGES) if (m.indexOf(k) !== -1) return MESSAGES[k];
    if (/invalid login/i.test(m)) return 'Email atau kata sandi salah.';
    if (/failed to fetch|network/i.test(m)) return 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
    return 'Terjadi kesalahan. Coba lagi sebentar lagi.';
  }
  function errCode(e) {
    var m = (e && e.message) || '';
    for (var k in MESSAGES) if (m.indexOf(k) !== -1) return k;
    return '';
  }

  /* ---------- Utilitas ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rupiah(n) { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }
  function num(n) { return Number(n).toLocaleString('id-ID'); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* Ingatan kecil di perangkat: ID + token terakhir yang dibuka (tanpa data pribadi lain) */
  var ok = false, mem = {};
  try { w.localStorage.setItem('__kk', '1'); w.localStorage.removeItem('__kk'); ok = true; } catch (e) {}
  var store = {
    get: function (k) { try { return ok ? JSON.parse(w.localStorage.getItem(k)) : (mem[k] || null); } catch (e) { return null; } },
    set: function (k, v) { try { if (ok) w.localStorage.setItem(k, JSON.stringify(v)); else mem[k] = v; } catch (e) {} },
    del: function (k) { try { if (ok) w.localStorage.removeItem(k); else delete mem[k]; } catch (e) {} }
  };

  /* ---------- Tier & poin (untuk tampilan; hitungan resmi ada di server) ---------- */
  function tierOf(p) {
    var t = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (p >= TIERS[i].min) t = TIERS[i];
    return t;
  }
  function nextTier(p) {
    for (var i = 0; i < TIERS.length; i++) if (p < TIERS[i].min) return TIERS[i];
    return null;
  }
  function preview(m, amount) {
    var t = tierOf(m.poin);
    var bayar = Math.round(amount * (100 - t.disc) / 100);
    return { tier: t, disc: t.disc, bayar: bayar, pts: Math.floor(bayar / 10000) * t.rate };
  }
  function isBirthdayMonth(m) {
    if (!m.lahir) return false;
    return parseInt(String(m.lahir).split('-')[1], 10) === new Date().getMonth() + 1;
  }

  /* ---------- Tautan & QR ---------- */
  function link(m) {
    var frag = 'm=' + encodeURIComponent(m.id) + '.' + encodeURIComponent(m.token);
    try { var u = new URL('member.html', w.location.href); u.hash = frag; return u.href; }
    catch (e) { return 'member.html#' + frag; }
  }
  /* Terima URL kartu, teks "KK-12345.token", atau ID biasa. Hasil: {id, token|null} */
  function parseScan(text) {
    text = String(text || '').trim();
    var frag = text;
    try { frag = new URL(text).hash; } catch (e) {}
    var p = new URLSearchParams(String(frag).replace(/^#/, ''));
    var v = p.get('m');
    if (v) {
      var i = v.lastIndexOf('.');
      if (i > 0) return { id: v.slice(0, i).toUpperCase(), token: v.slice(i + 1) };
    }
    return text ? { id: text.toUpperCase(), token: null } : null;
  }

  function drawQR(el, text, size) {
    el.innerHTML = '';
    if (!w.QRCode) { el.textContent = 'QR belum termuat. Periksa koneksi internet.'; return; }
    new w.QRCode(el, { text: text, width: size, height: size, colorDark: '#1A1109', colorLight: '#FFFFFF',
                       correctLevel: w.QRCode.CorrectLevel.M });
  }
  function cardHTML(m) {
    var t = tierOf(m.poin), n = nextTier(m.poin);
    var pct = n ? Math.min(100, Math.round((m.poin - t.min) / (n.min - t.min) * 100)) : 100;
    var next = n ? num(n.min - m.poin) + ' poin lagi menuju ' + n.name : 'Tier tertinggi sudah tercapai';
    return '<article class="mcard ' + t.key + '" aria-label="Kartu member ' + esc(m.nama) + '">' +
      '<div class="mcard-rim"></div><div class="mcard-body">' +
      '<div class="mcard-top"><span class="mcard-brand">KopiKita</span><span class="tier-badge">' + t.name + '</span></div>' +
      '<p class="mcard-name">' + esc(m.nama) + '</p>' +
      '<p class="mcard-id">' + esc(m.id) + '</p>' +
      '<div class="mcard-points"><strong>' + num(m.poin) + '</strong> poin</div>' +
      '<div class="bar" role="progressbar" aria-label="Progres menuju tier berikutnya" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
      '<p class="mcard-next">' + next + '</p>' +
      '<div class="qr-box"><div class="qr" data-qr></div></div>' +
      '<p class="mcard-hint">Tunjukkan QR ini ke kasir</p>' +
      '</div></article>';
  }
  /* qrLink opsional: dipakai kartu contoh yang tidak punya token */
  function mountCard(container, m, size, qrLink) {
    container.innerHTML = cardHTML(m);
    drawQR(container.querySelector('[data-qr]'), qrLink || link(m), size || 200);
  }

  /* ---------- API member (publik) ---------- */
  async function register(d) {
    var r = await rpc('register_member', {
      p_nama: d.nama, p_hp: d.hp, p_email: d.email || null, p_lahir: d.lahir || null, p_ref: d.ref || null
    });
    store.set('kk_last', { id: r.id, token: r.token });
    return r;
  }
  async function getMember(id, token) {
    var m = await rpc('get_member', { p_id: id, p_token: token });
    if (m) { m.token = token; store.set('kk_last', { id: m.id, token: token }); }
    return m;
  }

  /* ---------- API kasir (perlu login) ---------- */
  async function signIn(email, password) {
    var r = await client().auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw r.error;
    return r.data;
  }
  async function signOut() { try { await client().auth.signOut(); } catch (e) {} }
  async function hasSession() {
    var r = await client().auth.getSession();
    return !!(r.data && r.data.session);
  }
  async function amIStaff() { return (await rpc('am_i_staff')) === true; }
  async function kasirFind(q) { return rpc('kasir_find', { p_q: q }); }
  async function kasirAdd(id, amount) { return rpc('kasir_add_transaction', { p_id: id, p_amount: amount }); }

  w.KK = {
    TIERS: TIERS, configured: configured, store: store, esc: esc, rupiah: rupiah, num: num, digits: digits,
    errText: errText, errCode: errCode, tierOf: tierOf, nextTier: nextTier, preview: preview,
    isBirthdayMonth: isBirthdayMonth, link: link, parseScan: parseScan, drawQR: drawQR, mountCard: mountCard,
    register: register, getMember: getMember,
    signIn: signIn, signOut: signOut, hasSession: hasSession, amIStaff: amIStaff,
    kasirFind: kasirFind, kasirAdd: kasirAdd
  };
})(window);
