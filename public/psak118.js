/* Zahir Insight — Laporan Laba Rugi PSAK 118 (adopsi IFRS 18, berlaku 1 Januari 2027).
   Penghasilan & beban dikelompokkan ke 5 kategori (Operasi, Investasi, Pendanaan, Pajak penghasilan, Operasi dihentikan)
   dengan subtotal wajib: laba operasi, laba sebelum pendanaan dan pajak penghasilan, laba. Susunan baris mengikuti contoh IAI.
   Data: mutasi per akun (custom query bb_saldo_awal) untuk periode ini & periode pembanding; tiap akun L/R dipetakan ke satu pos
   (tebakan otomatis dari klasifikasi + nama akun, bisa diubah di halaman Pemetaan Akun PSAK 118). Fungsi murni: bisa diuji di Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Psak118 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const norm = c => String(c ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();
  const CAT = { op: 'Operasi', inv: 'Investasi', fin: 'Pendanaan', tax: 'Pajak penghasilan', disc: 'Operasi yang dihentikan' };
  // pos laporan, urut sesuai penyajian
  const POS = [
    { id: 'op_rev', cat: 'op', label: 'Penjualan', bold: true },
    { id: 'op_cogs', cat: 'op', label: 'Beban pokok penjualan' },
    { id: 'op_oinc', cat: 'op', label: 'Penghasilan operasi lainnya' },
    { id: 'op_sell', cat: 'op', label: 'Beban penjualan' },
    { id: 'op_rnd', cat: 'op', label: 'Beban penelitian dan pengembangan' },
    { id: 'op_ga', cat: 'op', label: 'Beban umum dan administrasi' },
    { id: 'op_gw', cat: 'op', label: 'Kerugian penurunan nilai goodwill' },
    { id: 'op_oexp', cat: 'op', label: 'Beban operasi lainnya' },
    { id: 'inv_assoc', cat: 'inv', label: 'Bagian laba dan keuntungan pelepasan entitas asosiasi dan ventura bersama' },
    { id: 'inv_oth', cat: 'inv', label: 'Penghasilan (beban) investasi lainnya' },
    { id: 'fin_loan', cat: 'fin', label: 'Beban bunga dari pinjaman dan liabilitas sewa' },
    { id: 'fin_pens', cat: 'fin', label: 'Beban bunga dari liabilitas pensiun dan provisi' },
    { id: 'fin_oth', cat: 'fin', label: 'Penghasilan (beban) pendanaan lainnya' },
    { id: 'tax', cat: 'tax', label: 'Beban pajak penghasilan' },
    { id: 'disc', cat: 'disc', label: 'Laba (rugi) dari operasi yang dihentikan' },
  ];
  const POS_BY = Object.fromEntries(POS.map(p => [p.id, p]));
  const klsOf = a => { const k = parseInt(String(a.kls ?? ''), 10); if (k >= 1 && k <= 9) return k; const d = parseInt(String(a.kode ?? '').replace(/[^0-9]/g, '').charAt(0), 10); return d >= 1 && d <= 9 ? d : 0; };
  const isPL = a => klsOf(a) >= 4;

  // tebakan pos dari klasifikasi Zahir (4 pendapatan, 5 HPP, 6 beban usaha, ≥7 lain-lain) dan nama akun
  function guess(a) {
    const n = ' ' + String(a.nama ?? '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ') + ' ', k = klsOf(a), has = re => re.test(n);
    if (k < 4) return '';
    if (has(/dihentikan|discontinued/)) return 'disc';
    if (has(/pajak penghasilan|pph ?(badan|25|29)|income tax|pajak kini|pajak tangguhan/)) return 'tax';
    if (has(/goodwill/)) return 'op_gw';
    if (has(/asosiasi|ventura bersama|joint venture/)) return 'inv_assoc';
    if (has(/pensiun|imbalan (kerja|pasca)|provisi/) && has(/bunga|interest/)) return 'fin_pens';
    if (has(/beban bunga|biaya bunga|bunga pinjaman|bunga (bank|kredit|utang|hutang)|liabilitas sewa|bunga sewa|leasing|interest expense|provisi (bank|kredit)/) && !has(/pendapatan|penghasilan/)) return 'fin_loan';
    if (has(/pendapatan bunga|penghasilan bunga|jasa giro|bunga deposito|bunga tabungan|dividen|bagi hasil|investasi|properti investasi|interest income/)) return 'inv_oth';
    if (k === 4) return 'op_rev';
    if (k === 5) return 'op_cogs';
    if (k === 6) {
      if (has(/penelitian|pengembangan|riset|research/)) return 'op_rnd';
      if (has(/penjualan|pemasaran|marketing|iklan|promosi|distribusi|pengiriman|ekspedisi|komisi|selling/)) return 'op_sell';
      return 'op_ga';
    }
    return has(/pendapatan|penghasilan|laba|keuntungan|income|gain/) ? 'op_oinc' : 'op_oexp';
  }
  function resolve(map, a) {
    const m = map && map.accounts && map.accounts[norm(a.kode)];
    if (m && 'pos' in m) return { pos: POS_BY[m.pos] ? m.pos : '', guessed: false };
    return { pos: guess(a), guessed: true };
  }

  /* build: accs [{kode,nama,kls}], cur & prev = baris bb_saldo_awal periode ini / pembanding (prev boleh null), map, opt {detail, fmtKode}
     Nilai = kontribusi ke laba (penghasilan +, beban −); subtotal = jumlah berjalan. */
  function build({ accs, cur, prev, map, opt }) {
    opt = opt || {}; const fk = opt.fmtKode || (x => x); const two = !!prev;
    const A = new Map();
    const get = (kode, nama, kls) => { const k = norm(kode); let a = A.get(k); if (!a) { a = { key: k, kode, nama: nama || kode, kls: kls ?? '', v: [0, 0], act: false }; A.set(k, a); } else { if (nama && a.nama === a.kode) a.nama = nama; if ((a.kls === '' || a.kls == null) && kls != null && kls !== '') a.kls = kls; } return a; };
    for (const x of accs || []) get(x.kode, x.nama, x.kls);
    [cur, prev].forEach((rows, i) => { for (const r of rows || []) { const a = get(r.kode_akun, r.nama_akun, r.noklasifikasi); a.v[i] += num(r.kredit) - num(r.debit); a.act = true; } });
    const list = [...A.values()].filter(isPL).sort((x, y) => String(x.kode).localeCompare(String(y.kode), 'en', { numeric: true }));
    for (const a of list) Object.assign(a, resolve(map, a));
    const used = list.filter(a => a.act);
    const by = id => used.filter(a => a.pos === id);
    const sumv = xs => [0, 1].map(i => xs.reduce((s, a) => s + a.v[i], 0));
    const rows = []; let run = [0, 0];
    const line = id => { const xs = by(id); if (!xs.length) return; const v = sumv(xs); run = run.map((s, i) => s + v[i]);
      rows.push({ t: 'item', lvl: 0, label: POS_BY[id].label, v, b: POS_BY[id].bold, cat: POS_BY[id].cat });
      if (opt.detail) for (const a of xs) rows.push({ t: 'acc', lvl: 1, label: `${fk(a.kode)} · ${a.nama}`, v: a.v }); };
    const subtotal = (label, t) => rows.push({ t, lvl: 0, label, v: run.slice() });
    ['op_rev', 'op_cogs'].forEach(line);
    if (by('op_cogs').length) subtotal('Laba bruto', 'sub');
    ['op_oinc', 'op_sell', 'op_rnd', 'op_ga', 'op_gw', 'op_oexp'].forEach(line);
    const un = used.filter(a => !a.pos);
    if (un.length) { const v = sumv(un); run = run.map((s, i) => s + v[i]); rows.push({ t: 'item', lvl: 0, label: 'Belum dipetakan', v, un: true }); if (opt.detail) for (const a of un) rows.push({ t: 'acc', lvl: 1, label: `${fk(a.kode)} · ${a.nama}`, v: a.v }); }
    subtotal('Laba (rugi) operasi', 'tot');
    ['inv_assoc', 'inv_oth'].forEach(line);
    subtotal('Laba (rugi) sebelum pendanaan dan pajak penghasilan', 'tot');
    ['fin_loan', 'fin_pens', 'fin_oth'].forEach(line);
    subtotal('Laba (rugi) sebelum pajak penghasilan', 'sub');
    line('tax');
    if (by('disc').length) { subtotal('Laba (rugi) dari operasi yang dilanjutkan', 'sub'); line('disc'); }
    subtotal('Laba (rugi)', 'gt');
    if (!two) for (const r of rows) r.v = [r.v[0]];
    const guessed = used.filter(a => a.guessed && a.pos).length;
    return { rows, two, accounts: list, unmapped: un.map(a => ({ kode: a.kode, nama: a.nama })), guessed, total: run };
  }
  return { CAT, POS, POS_BY, guess, resolve, klsOf, norm, build };
});
