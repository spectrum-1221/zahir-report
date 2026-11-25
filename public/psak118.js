/* Zahir Insight — laporan keuangan PSAK 118 (adopsi IFRS 18, berlaku 1 Januari 2027) dari custom query:
   neraca_psak118, laba_rugi_psak118, perubahan_ekuitas_psak118, arus_kas_psak118 (+ CALK dari neraca & laba rugi).
   Tanpa pemetaan akun: kategori/pos ditentukan di custom query dari klasifikasi, subklasifikasi dan nama akun.
   Didaftarkan ke Psak109.KINDS sehingga memakai tampilan & ekspor yang sama dengan laporan PSAK 109.
   Keluaran builder: { cols, rows } — rows: {t, lvl, kode, label, vals[] }, kolom angka = periode ini & pembanding (tahun lalu). */
(function (root, factory) {
  const api = factory(root.Psak109 || (typeof require !== 'undefined' ? require('./psak109.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Psak118 = api;
})(typeof window !== 'undefined' ? window : globalThis, function (P109) {
  'use strict';
  const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const str = v => v == null ? '' : String(v);
  const lc = s => str(s).toLowerCase();
  function groups(rows, key) { const out = []; let cur = null; for (const r of rows) { const k = key(r); if (!cur || cur.k !== k) { cur = { k, r, rows: [] }; out.push(cur); } cur.rows.push(r); } return out; }
  const two = (rows, a = 'nilai_ini', b = 'nilai_lalu') => [rows.reduce((s, r) => s + num(r[a]), 0), rows.reduce((s, r) => s + num(r[b]), 0)];
  // label tanggal kolom: periode ini & periode yang sama tahun lalu
  const fmt = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d)); return m ? `${+m[3]}/${+m[2]}/${m[1]}` : str(d); };
  const prev = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d)); if (!m) return ''; const t = new Date(Date.UTC(+m[1] - 1, +m[2] - 1, +m[3])); if (t.getUTCMonth() !== +m[2] - 1) t.setUTCDate(0); return t.toISOString().slice(0, 10); };
  const COLS = (h1, h2) => [{ k: 'kode', label: 'Kode' }, { k: 'label', label: 'Uraian' }, { k: 0, label: h1, num: true }, { k: 1, label: h2, num: true }];
  const colsAsof = c => COLS('Per ' + fmt(c.d2), 'Per ' + fmt(prev(c.d2)));
  const colsRange = c => COLS(`${fmt(c.d1)} s/d ${fmt(c.d2)}`, `${fmt(prev(c.d1))} s/d ${fmt(prev(c.d2))}`);
  // akun bernilai 0 (custom query mengirim semua akun) disembunyikan kecuali opsi "Tampilkan saldo nol"
  const nz = (r, fs = ['nilai_ini', 'nilai_lalu']) => fs.some(f => Math.abs(num(r[f])) >= 0.005);
  const keep = (rows, c, test) => c.zero ? rows : rows.filter(test);
  const acc = (r, lvl) => ({ t: 'item', lvl, kode: str(r.akun_kode), label: str(r.akun_nama), vals: [num(r.nilai_ini), num(r.nilai_lalu)] });

  // Laporan Posisi Keuangan: ASET / LIABILITAS / EKUITAS → lancar / tidak lancar → pos (subklasifikasi) → akun
  function neraca(rows, c) {
    rows = keep(rows, c, r => nz(r));
    const out = []; const det = !!c.detail; let tl = [0, 0], tot = {};
    for (const g of groups(rows, r => str(r.kelompok))) {
      out.push({ t: 'h1', lvl: 0, label: g.k });
      for (const s of groups(g.rows, r => str(r.sub))) {
        if (g.k !== 'EKUITAS') out.push({ t: 'h2', lvl: 1, label: s.k });
        const lv = g.k === 'EKUITAS' ? 1 : 2;
        for (const p of groups(s.rows, r => str(r.pos))) {
          if (det) { out.push({ t: 'h3', lvl: lv, label: p.k }); for (const r of p.rows) out.push(r.akun_kode ? acc(r, lv + 1) : { t: 'item', lvl: lv + 1, label: str(r.akun_nama), vals: two([r]) }); out.push({ t: 'sub', lvl: lv, label: 'Jumlah ' + lc(p.k), vals: two(p.rows) }); }
          else out.push({ t: 'item', lvl: lv, label: p.k, vals: two(p.rows) });
        }
        if (g.k !== 'EKUITAS') out.push({ t: 'sub', lvl: 1, label: 'Jumlah ' + lc(s.k), vals: two(s.rows) });
      }
      const v = two(g.rows); tot[g.k] = v;
      out.push({ t: 'tot', lvl: 0, label: 'JUMLAH ' + g.k, vals: v }, { t: 'blank' });
      if (g.k !== 'ASET') tl = tl.map((x, i) => x + v[i]);
    }
    out.push({ t: 'gt', lvl: 0, label: 'JUMLAH LIABILITAS DAN EKUITAS', vals: tl });
    const a = tot.ASET || [0, 0], sel = a.map((x, i) => x - tl[i]);
    if (sel.some(x => Math.abs(x) >= 0.005)) out.push({ t: 'note', lvl: 0, label: 'Selisih aset − (liabilitas + ekuitas) (harus 0)', vals: sel });
    return { cols: colsAsof(c), rows: out };
  }

  // Laporan Laba Rugi (urutan & subtotal dari custom query laba_rugi_psak118)
  function labaRugi(rows, c) {
    rows = keep(rows, c, r => !['pos', 'akun'].includes(str(r.tipe)) || nz(r));
    const out = [];
    for (const r of rows) {
      const tp = str(r.tipe), v = [num(r.nilai_ini), num(r.nilai_lalu)];
      if (tp === 'akun') { if (c.detail) out.push({ t: 'item', lvl: 1, kode: str(r.akun_kode), label: str(r.uraian), vals: v }); continue; }
      if (tp === 'pos') out.push({ t: 'item', lvl: 0, label: str(r.uraian), vals: v, b: num(r.urut) === 10 || c.detail });
      else out.push({ t: tp === 'gt' ? 'gt' : tp === 'tot' ? 'tot' : 'sub', lvl: 0, label: str(r.uraian), vals: v });
    }
    return { cols: colsRange(c), rows: out };
  }

  // Laporan Perubahan Ekuitas: per komponen ekuitas — saldo awal, laba periode, penambahan, pengurangan, saldo akhir
  function ekuitas(rows, c) {
    const F = ['saldo_awal', 'laba_periode', 'penambahan', 'pengurangan', 'saldo_akhir'];
    rows = keep(rows, c, r => nz(r, F));
    const cols = [{ k: 'kode', label: 'Kode' }, { k: 'label', label: 'Komponen ekuitas' }, ...['Saldo awal', 'Laba (rugi) periode', 'Penambahan', 'Pengurangan', 'Saldo akhir'].map((l, i) => ({ k: i, label: l, num: true }))];
    const sum = xs => F.map(f => xs.reduce((s, r) => s + num(r[f]), 0));
    const out = [];
    for (const g of groups(rows, r => str(r.komponen))) {
      out.push({ t: 'item', lvl: 0, label: g.k, vals: sum(g.rows), b: true });
      if (c.detail && g.rows.some(r => r.akun_kode)) for (const r of g.rows) out.push({ t: 'item', lvl: 1, kode: str(r.akun_kode), label: str(r.akun_nama), vals: sum([r]) });
    }
    out.push({ t: 'gt', lvl: 0, label: 'JUMLAH EKUITAS', vals: sum(rows) });
    return { cols, rows: out };
  }

  // Laporan Arus Kas — metode tidak langsung dimulai dari laba (rugi) operasi (PSAK 118 / amandemen PSAK 207)
  function arusKas(rows, c) {
    rows = keep(rows, c, r => num(r.section_urut) >= 9 || nz(r));
    const out = []; const kas = rows.find(r => r.kas_akhir_ini != null) || {};
    const data = rows.filter(r => num(r.section_urut) < 9);
    for (const s of groups(data, r => str(r.section))) {
      out.push({ t: 'h1', lvl: 0, label: s.k });
      for (const b of groups(s.rows, r => str(r.blok))) {
        if (b.k) out.push({ t: 'h2', lvl: 1, label: b.k });
        const lv = b.k ? 2 : 1;
        for (const u of groups(b.rows, r => str(r.uraian))) {
          out.push({ t: 'item', lvl: lv, label: u.k, vals: two(u.rows), b: c.detail });
          if (c.detail) for (const r of u.rows) out.push(acc(r, lv + 1));
        }
      }
      out.push({ t: 'sub0', lvl: 0, label: 'Kas bersih dari (untuk) ' + lc(s.k.replace(/^ARUS KAS DARI /, '').toLowerCase()), vals: two(s.rows) }, { t: 'blank' });
    }
    const net = two(data), akhir = [num(kas.kas_akhir_ini), num(kas.kas_akhir_lalu)];
    out.push({ t: 'tot', lvl: 0, label: 'Kenaikan (penurunan) bersih kas dan setara kas', vals: net },
      { t: 'item', lvl: 0, label: 'Kas dan setara kas awal periode', vals: akhir.map((x, i) => x - net[i]), b: true },
      { t: 'gt', lvl: 0, label: 'Kas dan setara kas akhir periode', vals: akhir });
    return { cols: colsRange(c), rows: out };
  }

  // Catalan atas Laporan Keuangan: rincian akun per pos neraca & laba rugi + analisis beban berdasarkan sifat (wajib bila beban disajikan per fungsi)
  const SIFAT = [
    ['Persediaan dan bahan yang digunakan', /(harga pokok|hpp|persediaan|bahan baku|bahan pembantu|pembelian)/],
    ['Beban imbalan kerja', /(gaji|upah|tunjangan|karyawan|pegawai|honor|lembur|bpjs|thr|imbalan|bonus|insentif|pesangon)/],
    ['Penyusutan dan amortisasi', /(penyusutan|amortisasi|depresiasi)/],
    ['Penurunan nilai', /(penurunan nilai|impairment|goodwill|penyisihan|kerugian kredit)/],
    ['Sewa', /(sewa|rental)/],
    ['Iklan dan promosi', /(iklan|promosi|pemasaran|marketing)/],
    ['Transportasi dan pengiriman', /(pengiriman|ekspedisi|transport|angkut|bensin|bbm|perjalanan)/],
    ['Utilitas', /(listrik|air|telepon|internet|utilitas)/],
  ];
  function calk(rows, c) {
    const N = keep(rows.filter(r => r.__q === 'n'), c, r => nz(r)), L = keep(rows.filter(r => r.__q === 'l'), c, r => !['pos', 'akun'].includes(str(r.tipe)) || nz(r));
    const out = []; let no = 0;
    out.push({ t: 'h1', lvl: 0, label: 'Dasar penyajian' }, { t: 'note', lvl: 1, label: 'Laporan keuangan disajikan sesuai PSAK 118 Penyajian dan Pengungkapan dalam Laporan Keuangan. Laba rugi dikelompokkan ke kategori operasi, investasi, pendanaan, pajak penghasilan, dan operasi yang dihentikan; beban operasi disajikan berdasarkan fungsi.' }, { t: 'blank' });
    out.push({ t: 'h1', lvl: 0, label: 'Rincian pos laporan posisi keuangan (per ' + fmt(c.d2) + ' dan ' + fmt(prev(c.d2)) + ')' });
    for (const p of groups(N, r => str(r.kelompok) + '|' + str(r.pos))) {
      out.push({ t: 'h2', lvl: 1, label: `${++no}. ${str(p.r.pos)}` });
      for (const r of p.rows) out.push(r.akun_kode ? acc(r, 2) : { t: 'item', lvl: 2, label: str(r.akun_nama), vals: two([r]) });
      out.push({ t: 'sub', lvl: 1, label: 'Jumlah ' + lc(p.r.pos), vals: two(p.rows) });
    }
    out.push({ t: 'blank' }, { t: 'h1', lvl: 0, label: 'Rincian pos laba rugi (' + fmt(c.d1) + ' s/d ' + fmt(c.d2) + ' dan periode yang sama tahun lalu)' });
    for (const p of groups(L.filter(r => str(r.tipe) === 'akun'), r => str(r.urut))) {
      const pos = L.find(r => str(r.tipe) === 'pos' && str(r.urut) === p.k);
      out.push({ t: 'h2', lvl: 1, label: `${++no}. ${pos ? str(pos.uraian) : ''} (kategori ${lc(pos ? str(pos.kategori) : '')})` });
      for (const r of p.rows) out.push({ t: 'item', lvl: 2, kode: str(r.akun_kode), label: str(r.uraian), vals: two([r]) });
      out.push({ t: 'sub', lvl: 1, label: 'Jumlah ' + lc(pos ? str(pos.uraian) : ''), vals: two(p.rows) });
    }
    // beban operasi menurut sifat: akun di pos beban kategori operasi (beban pokok, penjualan, litbang, umum & adm., goodwill, operasi lainnya)
    const opx = L.filter(r => str(r.tipe) === 'akun' && [20, 40, 50, 60, 70, 80].includes(num(r.urut)));
    if (opx.length) {
      out.push({ t: 'blank' }, { t: 'h1', lvl: 0, label: `${++no}. Beban operasi berdasarkan sifat` },
        { t: 'note', lvl: 1, label: 'Diungkapkan karena beban operasi di laporan laba rugi disajikan berdasarkan fungsi (PSAK 118). Pengelompokan menurut nama akun.' });
      const by = new Map();
      for (const r of opx) { const n = str(r.uraian).toLowerCase(); const k = (SIFAT.find(([, re]) => re.test(n)) || ['Beban operasi lainnya'])[0]; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
      for (const [k] of [...SIFAT, ['Beban operasi lainnya']]) { const xs = by.get(k); if (!xs) continue;
        out.push({ t: 'item', lvl: 1, label: k, vals: two(xs), b: c.detail }); if (c.detail) for (const r of xs) out.push({ t: 'item', lvl: 2, kode: str(r.akun_kode), label: str(r.uraian), vals: two([r]) }); }
      out.push({ t: 'sub', lvl: 1, label: 'Jumlah beban operasi', vals: two(opx) });
    }
    out.push({ t: 'blank' }, { t: 'h1', lvl: 0, label: `${++no}. Ukuran kinerja yang ditetapkan manajemen (MPM)` },
      { t: 'note', lvl: 1, label: 'Diisi bila entitas mengomunikasikan ukuran kinerja di luar subtotal PSAK 118 (mis. EBITDA disesuaikan) beserta rekonsiliasinya ke subtotal laba rugi.' });
    return { cols: COLS('Periode ini', 'Pembanding'), rows: out };
  }

  const KINDS = {
    neraca118: { build: neraca, title: 'LAPORAN POSISI KEUANGAN - PSAK 118', per: 'asof', cls: 'p118', toggle: true, zero: true },
    lr118: { build: labaRugi, title: 'LAPORAN LABA RUGI', per: 'range', cls: 'p118', toggle: true, zero: true },
    ekuitas118: { build: ekuitas, title: 'LAPORAN PERUBAHAN EKUITAS - PSAK 118', per: 'range', cls: 'p118', toggle: true, zero: true },
    arus118: { build: arusKas, title: 'LAPORAN ARUS KAS (METODE TIDAK LANGSUNG) - PSAK 118', per: 'range', cls: 'p118', toggle: true, zero: true },
    calk118: { build: calk, title: 'CATATAN ATAS LAPORAN KEUANGAN - PSAK 118', per: 'range', cls: 'p118', toggle: true, zero: true },
  };
  if (P109 && P109.KINDS) Object.assign(P109.KINDS, KINDS);
  return { KINDS, prev };
});
