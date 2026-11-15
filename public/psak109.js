/* Zahir Insight — Laporan keuangan amil zakat (PSAK 109 / PSAK 409 setelah penomoran ulang 2024).
   Fungsi murni (tanpa DOM/jaringan), dipakai browser dan bisa diuji di Node.
   Data masuk: akumulasi debit/kredit per akun (custom query bb_saldo_awal) sebelum periode & selama periode,
   baris jurnal transaksi kas (psak109_kas_lawan), dan pemetaan akun → pos laporan (diatur user di halaman Pemetaan Akun). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Psak109 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const num = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const norm = c => String(c ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();
  const r2 = v => Math.round(v * 100) / 100;
  const isZero = v => Math.abs(v) < 0.005;

  const DANA = { z: 'Dana Zakat', i: 'Dana Infak/Sedekah', a: 'Dana Amil', n: 'Dana Nonhalal' };
  const DANA_ORDER = ['z', 'i', 'a', 'n'];

  // ---- pos laporan. kind: bs (aset/liabilitas), eq (saldo dana), in (penerimaan), cut (pengurang penerimaan: bagian amil), out (penyaluran/penggunaan)
  // sect (bs): al = aset lancar, atl = aset tidak lancar, ljp = liabilitas jangka pendek, ljpj = liabilitas jangka panjang
  // kel (aset kelolaan, untuk Laporan Perubahan Aset Kelolaan): l = lancar, tl = tidak lancar; col: nilai | susut | sisih
  const POS = [
    { id: 'bs_kas', kind: 'bs', sect: 'al', label: 'Kas dan setara kas', cash: true },
    { id: 'bs_inv', kind: 'bs', sect: 'al', label: 'Instrumen keuangan' },
    { id: 'bs_piut', kind: 'bs', sect: 'al', label: 'Piutang' },
    { id: 'bs_kel_l', kind: 'bs', sect: 'al', label: 'Aset kelolaan lancar (mis. piutang bergulir)', kel: 'l', col: 'nilai' },
    { id: 'bs_kel_pny', kind: 'bs', sect: 'al', label: 'Penyisihan aset kelolaan', kel: 'l', col: 'sisih' },
    { id: 'bs_al_lain', kind: 'bs', sect: 'al', label: 'Aset lancar lainnya' },
    { id: 'bs_at', kind: 'bs', sect: 'atl', label: 'Aset tetap' },
    { id: 'bs_at_ak', kind: 'bs', sect: 'atl', label: 'Akumulasi penyusutan aset tetap' },
    { id: 'bs_kel_tl', kind: 'bs', sect: 'atl', label: 'Aset kelolaan tidak lancar', kel: 'tl', col: 'nilai' },
    { id: 'bs_kel_ak', kind: 'bs', sect: 'atl', label: 'Akumulasi penyusutan aset kelolaan', kel: 'tl', col: 'susut' },
    { id: 'bs_atl_lain', kind: 'bs', sect: 'atl', label: 'Aset tidak lancar lainnya' },
    { id: 'bs_bymhd', kind: 'bs', sect: 'ljp', label: 'Biaya yang masih harus dibayar' },
    { id: 'bs_ljp_lain', kind: 'bs', sect: 'ljp', label: 'Liabilitas jangka pendek lainnya' },
    { id: 'bs_imb', kind: 'bs', sect: 'ljpj', label: 'Liabilitas imbalan kerja jangka panjang' },
    { id: 'bs_ljpj_lain', kind: 'bs', sect: 'ljpj', label: 'Liabilitas jangka panjang lainnya' },

    { id: 'eq_z', kind: 'eq', dana: 'z', label: 'Saldo dana zakat' },
    { id: 'eq_i', kind: 'eq', dana: 'i', label: 'Saldo dana infak/sedekah' },
    { id: 'eq_a', kind: 'eq', dana: 'a', label: 'Saldo dana amil' },
    { id: 'eq_n', kind: 'eq', dana: 'n', label: 'Saldo dana nonhalal' },

    { id: 'z_in_ent', kind: 'in', dana: 'z', label: 'Penerimaan dari muzaki entitas' },
    { id: 'z_in_ind', kind: 'in', dana: 'z', label: 'Penerimaan dari muzaki individual' },
    { id: 'z_in_hasil', kind: 'in', dana: 'z', label: 'Hasil penempatan dana zakat' },
    { id: 'z_in_lain', kind: 'in', dana: 'z', label: 'Penerimaan dana zakat lainnya' },
    { id: 'z_amil', kind: 'cut', dana: 'z', label: 'Bagian amil atas penerimaan dana zakat' },
    { id: 'z_out_fakir', kind: 'out', dana: 'z', label: 'Fakir' },
    { id: 'z_out_miskin', kind: 'out', dana: 'z', label: 'Miskin' },
    { id: 'z_out_riqab', kind: 'out', dana: 'z', label: 'Riqab' },
    { id: 'z_out_gharim', kind: 'out', dana: 'z', label: 'Gharimin' },
    { id: 'z_out_muallaf', kind: 'out', dana: 'z', label: 'Muallaf' },
    { id: 'z_out_sabil', kind: 'out', dana: 'z', label: 'Fisabilillah' },
    { id: 'z_out_ibnu', kind: 'out', dana: 'z', label: 'Ibnu sabil' },
    { id: 'z_out_lain', kind: 'out', dana: 'z', label: 'Penyaluran dana zakat lainnya' },

    { id: 'i_in_terikat', kind: 'in', dana: 'i', label: 'Infak/sedekah terikat (muqayyadah)' },
    { id: 'i_in_bebas', kind: 'in', dana: 'i', label: 'Infak/sedekah tidak terikat (mutlaqah)' },
    { id: 'i_in_hasil', kind: 'in', dana: 'i', label: 'Hasil pengelolaan dana infak/sedekah' },
    { id: 'i_in_lain', kind: 'in', dana: 'i', label: 'Penerimaan dana infak/sedekah lainnya' },
    { id: 'i_amil', kind: 'cut', dana: 'i', label: 'Bagian amil atas penerimaan dana infak/sedekah' },
    { id: 'i_out_terikat', kind: 'out', dana: 'i', label: 'Infak/sedekah terikat (muqayyadah)' },
    { id: 'i_out_bebas', kind: 'out', dana: 'i', label: 'Infak/sedekah tidak terikat (mutlaqah)' },
    { id: 'i_out_kel', kind: 'out', dana: 'i', label: 'Alokasi pemanfaatan aset kelolaan (penyusutan & penyisihan)' },
    { id: 'i_out_lain', kind: 'out', dana: 'i', label: 'Penyaluran dana infak/sedekah lainnya' },

    { id: 'a_in_z', kind: 'in', dana: 'a', label: 'Bagian amil dari dana zakat' },
    { id: 'a_in_i', kind: 'in', dana: 'a', label: 'Bagian amil dari dana infak/sedekah' },
    { id: 'a_in_lain', kind: 'in', dana: 'a', label: 'Penerimaan dana amil lainnya' },
    { id: 'a_out_peg', kind: 'out', dana: 'a', label: 'Beban pegawai' },
    { id: 'a_out_susut', kind: 'out', dana: 'a', label: 'Beban penyusutan' },
    { id: 'a_out_umum', kind: 'out', dana: 'a', label: 'Beban umum dan administrasi lainnya' },

    { id: 'n_in_bunga', kind: 'in', dana: 'n', label: 'Bunga bank' },
    { id: 'n_in_giro', kind: 'in', dana: 'n', label: 'Jasa giro' },
    { id: 'n_in_lain', kind: 'in', dana: 'n', label: 'Penerimaan nonhalal lainnya' },
    { id: 'n_out', kind: 'out', dana: 'n', label: 'Penyaluran dana nonhalal' },
  ];
  const POS_BY = Object.fromEntries(POS.map(p => [p.id, p]));
  const SECT = { al: 'Aset lancar', atl: 'Aset tidak lancar', ljp: 'Liabilitas jangka pendek', ljpj: 'Liabilitas jangka panjang' };
  // kelompok untuk dropdown pemetaan
  const POS_GROUPS = [
    { label: 'Aset lancar', ids: POS.filter(p => p.sect === 'al').map(p => p.id) },
    { label: 'Aset tidak lancar', ids: POS.filter(p => p.sect === 'atl').map(p => p.id) },
    { label: 'Liabilitas', ids: POS.filter(p => p.sect === 'ljp' || p.sect === 'ljpj').map(p => p.id) },
    { label: 'Saldo dana', ids: POS.filter(p => p.kind === 'eq').map(p => p.id) },
    ...DANA_ORDER.map(d => ({ label: DANA[d] + ' — penerimaan', ids: POS.filter(p => p.dana === d && (p.kind === 'in' || p.kind === 'cut')).map(p => p.id) })),
    ...DANA_ORDER.map(d => ({ label: DANA[d] + ' — penyaluran/penggunaan', ids: POS.filter(p => p.dana === d && p.kind === 'out').map(p => p.id) })),
  ];
  const posLabel = id => { const p = POS_BY[id]; if (!p) return ''; return (p.kind === 'out' && (p.dana === 'z' || p.dana === 'i') ? 'Penyaluran ' + DANA[p.dana].replace('Dana ', '').toLowerCase() + ' – ' : '') + p.label; };

  // ---- pos arus kas (metode langsung)
  const CF = [
    { id: 'cf_z_in', act: 'o', label: 'Penerimaan dana zakat' },
    { id: 'cf_i_in', act: 'o', label: 'Penerimaan dana infak/sedekah' },
    { id: 'cf_a_in', act: 'o', label: 'Penerimaan dana amil' },
    { id: 'cf_n_in', act: 'o', label: 'Penerimaan dana nonhalal' },
    { id: 'cf_z_out', act: 'o', label: 'Penyaluran dana zakat' },
    { id: 'cf_i_out', act: 'o', label: 'Penyaluran dana infak/sedekah' },
    { id: 'cf_a_out', act: 'o', label: 'Pembayaran beban amil' },
    { id: 'cf_n_out', act: 'o', label: 'Penyaluran dana nonhalal' },
    { id: 'cf_o_lain', act: 'o', label: 'Penerimaan (pembayaran) operasi lainnya' },
    { id: 'cf_inv', act: 'i', label: 'Penempatan (pencairan) instrumen keuangan' },
    { id: 'cf_at', act: 'i', label: 'Perolehan (pelepasan) aset tetap' },
    { id: 'cf_kel', act: 'i', label: 'Penyaluran (penerimaan kembali) aset kelolaan' },
    { id: 'cf_i_lain', act: 'i', label: 'Arus kas investasi lainnya' },
    { id: 'cf_f', act: 'f', label: 'Penerimaan (pembayaran) pinjaman' },
    { id: 'cf_f_lain', act: 'f', label: 'Arus kas pendanaan lainnya' },
  ];
  const CF_BY = Object.fromEntries(CF.map(c => [c.id, c]));
  const ACT = { o: 'Arus kas dari aktivitas operasi', i: 'Arus kas dari aktivitas investasi', f: 'Arus kas dari aktivitas pendanaan' };
  function cfDefault(pos, kls) {
    const p = POS_BY[pos];
    if (p) {
      if (p.kind === 'in' || p.kind === 'eq') return 'cf_' + p.dana + '_in';
      if (p.kind === 'cut') return 'cf_' + p.dana + '_out';
      if (p.kind === 'out') return 'cf_' + p.dana + '_out';
      if (p.id === 'bs_inv') return 'cf_inv';
      if (p.id === 'bs_at' || p.id === 'bs_at_ak') return 'cf_at';
      if (p.kel) return 'cf_kel';
      if (p.id === 'bs_atl_lain') return 'cf_i_lain';
      if (p.id === 'bs_ljpj_lain') return 'cf_f';
      return 'cf_o_lain';
    }
    return 'cf_o_lain';
  }

  // ---- tebakan pos dari nama akun (bahasa Indonesia), untuk akun yang belum dipetakan
  const klsOf = a => { const k = parseInt(String(a.kls ?? ''), 10); if (k >= 1 && k <= 9) return k; const d = parseInt(String(a.kode ?? '').replace(/[^0-9]/g, '').charAt(0), 10); return d >= 1 && d <= 9 ? d : 0; };
  function guess(a) {
    const n = ' ' + String(a.nama ?? '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ') + ' ', k = klsOf(a);
    const has = re => re.test(n);
    const infak = /infa[qk]|sedekah|s[h]?[ao]d[ae]q[ao]h|shodaqoh|sodaqoh/, zakat = /zaka[th]/, nonhalal = /non ?halal|bunga|konvensional/;
    const amilShare = /bagian amil|hak amil|porsi amil/;
    if (k === 1) {
      if (has(/akum\w* (penyusutan|depresiasi)/)) return has(/kelolaan/) ? 'bs_kel_ak' : 'bs_at_ak';
      if (has(/penyisihan|cadangan kerugian/)) return has(/bergulir|qard|kelolaan/) ? 'bs_kel_pny' : 'bs_al_lain';
      if (has(/bergulir|qard[hu]?/)) return 'bs_kel_l';
      if (has(/kelolaan/)) return 'bs_kel_tl';
      if (has(/deposito|sukuk|reksa ?dana|obligasi|saham|investasi/)) return 'bs_inv';
      if (has(/ kas |^ kas| cash |bank|giro|tabungan|petty/)) return 'bs_kas';
      if (has(/piutang|uang muka|panjar/)) return 'bs_piut';
      if (has(/tanah|gedung|bangunan|kendaraan|peralatan|inventaris|aset tetap|aktiva tetap|mesin|komputer|perlengkapan kantor|furnitur|mebel/)) return 'bs_at';
      return 'bs_al_lain';
    }
    if (k === 2) {
      if (has(/imbalan|pesangon|pasca ?kerja/)) return 'bs_imb';
      if (has(/jangka panjang/)) return 'bs_ljpj_lain';
      if (has(/masih harus|akrual|accrued|terutang/)) return 'bs_bymhd';
      return 'bs_ljp_lain';
    }
    if (k === 3) {
      if (has(nonhalal)) return 'eq_n';
      if (has(zakat)) return 'eq_z';
      if (has(infak)) return 'eq_i';
      if (has(/amil/)) return 'eq_a';
      return '';
    }
    if (k === 4 || k === 7) {
      if (has(nonhalal)) return has(/giro/) ? 'n_in_giro' : has(/bunga/) ? 'n_in_bunga' : 'n_in_lain';
      if (has(amilShare)) return has(zakat) ? 'a_in_z' : has(infak) ? 'a_in_i' : 'a_in_lain';
      if (has(zakat)) return has(/entitas|lembaga|perusahaan|badan|korporasi|instansi/) ? 'z_in_ent' : has(/hasil|bagi hasil|penempatan/) ? 'z_in_hasil' : 'z_in_ind';
      if (has(infak)) return has(/tidak terikat|mutlaq|umum/) ? 'i_in_bebas' : has(/terikat|muqayyad|program/) ? 'i_in_terikat' : has(/hasil|bagi hasil|pengelolaan/) ? 'i_in_hasil' : 'i_in_bebas';
      if (has(/amil|operasional/)) return 'a_in_lain';
      return '';
    }
    if (k >= 5) {
      if (has(nonhalal)) return 'n_out';
      if (has(amilShare)) return has(zakat) ? 'z_amil' : has(infak) ? 'i_amil' : 'a_out_umum';
      if (has(zakat) || has(/asnaf|mustahi[qk]/)) {
        if (has(/fakir/)) return 'z_out_fakir';
        if (has(/miskin/)) return 'z_out_miskin';
        if (has(/riqab|budak/)) return 'z_out_riqab';
        if (has(/gharim/)) return 'z_out_gharim';
        if (has(/mu ?all?af/)) return 'z_out_muallaf';
        if (has(/ibnu ?sabil/)) return 'z_out_ibnu';
        if (has(/sabil/)) return 'z_out_sabil';
        return 'z_out_lain';
      }
      if (has(/kelolaan/)) return 'i_out_kel';
      if (has(infak)) return has(/tidak terikat|mutlaq|umum/) ? 'i_out_bebas' : has(/terikat|muqayyad|program/) ? 'i_out_terikat' : 'i_out_bebas';
      if (has(/penyusutan|depresiasi/)) return 'a_out_susut';
      if (has(/gaji|pegawai|karyawan|honor|tunjangan|upah| thr |bpjs|lembur|insentif|imbalan kerja/)) return 'a_out_peg';
      return 'a_out_umum';
    }
    return '';
  }

  // pemetaan efektif satu akun: {pos, cf, link, guessed}
  function resolve(map, a) {
    const m = (map && map.accounts && map.accounts[norm(a.kode)]) || null;
    if (m && 'pos' in m) return { pos: m.pos || '', cf: m.cf || '', link: m.link || '', guessed: false };
    return { pos: guess(a), cf: '', link: '', guessed: true };
  }
  // akun akumulasi/penyisihan aset kelolaan → akun aset kelolaan terkait (kode ternormalisasi)
  function linkKel(acc, assets) {
    if (!assets.length) return '';
    const words = s => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !/^(akumulasi|penyusutan|aset|kelolaan|penyisihan|dana|dan|atas)$/.test(w)));
    const w = words(acc.nama); let best = assets[0], score = -1;
    for (const x of assets) { let s = 0; for (const t of words(x.nama)) if (w.has(t)) s++; if (s > score) { score = s; best = x; } }
    return norm(best.kode);
  }

  /* build: menyusun keempat laporan.
     accs  : [{kode, nama, kls, account_id}] — semua akun yang dikenal
     sa    : baris akumulasi sebelum periode (field kode_akun, debit, kredit)
     mu    : baris akumulasi selama periode
     kas   : baris jurnal transaksi kas (jurnal_id, transaction_id, kode_akun, debit, kredit) — boleh null bila arus kas tidak diminta
     map   : pemetaan tersimpan {accounts: {kodeNorm: {pos, cf, link}}}
     opt   : {detail: true → rincian per akun di bawah tiap pos, fmtKode} */
  function build({ accs, sa, mu, kas, map, opt }) {
    opt = opt || {}; const fk = opt.fmtKode || (x => x);
    const A = new Map();
    const get = (kode, nama, kls) => { const k = norm(kode); let a = A.get(k); if (!a) { a = { key: k, kode, nama: nama || kode, kls: kls ?? '', sa: 0, d: 0, k: 0 }; A.set(k, a); } else { if (nama && (!a.nama || a.nama === a.kode)) a.nama = nama; if ((a.kls === '' || a.kls == null) && kls != null && kls !== '') a.kls = kls; } return a; };
    for (const x of accs || []) get(x.kode, x.nama, x.kls);
    for (const r of sa || []) { const a = get(r.kode_akun, r.nama_akun, r.noklasifikasi); a.sa += num(r.debit) - num(r.kredit); }
    for (const r of mu || []) { const a = get(r.kode_akun, r.nama_akun, r.noklasifikasi); a.d += num(r.debit); a.k += num(r.kredit); }
    for (const a of A.values()) { a.end = a.sa + a.d - a.k; Object.assign(a, resolve(map, a)); if (!POS_BY[a.pos]) a.pos = ''; a.klsN = klsOf(a); }
    const list = [...A.values()].sort((x, y) => String(x.kode).localeCompare(String(y.kode), 'en', { numeric: true }));
    const label = a => `${fk(a.kode)} · ${a.nama}`;
    const isPL = a => a.klsN >= 4;
    const active = a => !isZero(a.sa) || !isZero(a.d) || !isZero(a.k);
    // dana tempat saldo akun ini bermuara (untuk saldo dana)
    const danaOf = a => { const p = POS_BY[a.pos]; if (p && p.dana) return p.dana; return ''; };
    const unmapped = list.filter(a => active(a) && !a.pos);
    const warn = [];

    /* ---------- Laporan Posisi Keuangan ---------- */
    const lpk = []; const bsVal = a => a.klsN === 2 || POS_BY[a.pos]?.sect === 'ljp' || POS_BY[a.pos]?.sect === 'ljpj' ? -a.end : a.end;
    const sectAcc = s => list.filter(a => { const p = POS_BY[a.pos]; if (p && p.kind === 'bs') return p.sect === s; if (!a.pos && active(a)) { if (a.klsN === 1) return s === 'al'; if (a.klsN === 2) return s === 'ljp'; } return false; });
    const posRows = (accsIn, val, out, lvl) => { let tot = 0; const by = new Map();
      for (const a of accsIn) { const id = a.pos || '__un' + a.klsN; if (!by.has(id)) by.set(id, []); by.get(id).push(a); }
      const order = id => { const i = POS.findIndex(p => p.id === id); return i < 0 ? 999 : i; };
      for (const [id, xs] of [...by].sort((p, q) => order(p[0]) - order(q[0]))) {
        const v = xs.reduce((s, a) => s + val(a), 0); tot += v;
        if (xs.every(a => isZero(val(a))) && !xs.some(active)) continue;
        out.push({ t: 'item', lvl, label: POS_BY[id] ? POS_BY[id].label : 'Belum dipetakan', v, un: !POS_BY[id] });
        if (opt.detail) for (const a of xs) if (active(a)) out.push({ t: 'acc', lvl: lvl + 1, label: label(a), v: val(a) });
      }
      return tot; };
    lpk.push({ t: 'h1', label: 'ASET' });
    let totAset = 0;
    for (const s of ['al', 'atl']) { lpk.push({ t: 'h2', lvl: 1, label: SECT[s] }); const v = posRows(sectAcc(s), bsVal, lpk, 2); totAset += v; lpk.push({ t: 'sub', lvl: 1, label: 'Jumlah ' + SECT[s].toLowerCase(), v }); }
    lpk.push({ t: 'tot', label: 'JUMLAH ASET', v: totAset }, { t: 'blank' });
    lpk.push({ t: 'h1', label: 'LIABILITAS DAN SALDO DANA' }, { t: 'h2', lvl: 1, label: 'LIABILITAS' });
    let totLiab = 0;
    for (const s of ['ljp', 'ljpj']) { const xs = sectAcc(s); if (!xs.some(active) && s === 'ljpj') continue; lpk.push({ t: 'h2', lvl: 2, label: SECT[s] }); const v = posRows(xs, bsVal, lpk, 3); totLiab += v; lpk.push({ t: 'sub', lvl: 2, label: 'Jumlah ' + SECT[s].toLowerCase(), v }); }
    lpk.push({ t: 'sub', lvl: 1, label: 'Jumlah liabilitas', v: totLiab });
    // saldo dana = akun saldo dana (modal) + akumulasi penerimaan − penyaluran seluruh periode sebelumnya & berjalan (akun L/R yang dipetakan ke dana itu)
    const fundAcc = d => list.filter(a => POS_BY[a.pos] && POS_BY[a.pos].dana === d);
    const fundUn = list.filter(a => active(a) && !a.pos && a.klsN !== 1 && a.klsN !== 2);
    const fundEnd = {}; for (const d of DANA_ORDER) fundEnd[d] = fundAcc(d).reduce((s, a) => s - a.end, 0);
    const unEnd = fundUn.reduce((s, a) => s - a.end, 0);
    lpk.push({ t: 'h2', lvl: 1, label: 'SALDO DANA' });
    for (const d of DANA_ORDER) lpk.push({ t: 'item', lvl: 2, label: DANA[d], v: fundEnd[d] });
    if (!isZero(unEnd) || fundUn.length) { lpk.push({ t: 'item', lvl: 2, label: 'Saldo dana belum dipetakan', v: unEnd, un: true }); if (opt.detail) for (const a of fundUn) lpk.push({ t: 'acc', lvl: 3, label: label(a), v: -a.end }); }
    const totDana = DANA_ORDER.reduce((s, d) => s + fundEnd[d], 0) + unEnd;
    lpk.push({ t: 'sub', lvl: 1, label: 'Jumlah saldo dana', v: totDana });
    lpk.push({ t: 'tot', label: 'JUMLAH LIABILITAS DAN SALDO DANA', v: totLiab + totDana });
    const lpkDiff = r2(totAset - totLiab - totDana);
    // akun yang tidak masuk bagian mana pun (mis. akun L/R dipetakan ke pos aset) tetap terhitung lewat bsVal/sectAcc; selisih hanya bila data tidak seimbang
    if (!isZero(lpkDiff)) warn.push(`Laporan posisi keuangan tidak seimbang (selisih ${lpkDiff.toLocaleString('id-ID')}). Periksa akun yang dipetakan ke pos aset/liabilitas padahal akun pendapatan/beban, atau sebaliknya.`);

    /* ---------- Laporan Perubahan Dana ---------- */
    const lpd = []; const awal = {}, akhir = {};
    const mv = a => a.k - a.d;    // mutasi sisi kredit (penerimaan +)
    const lines = (accsIn, val, lvl) => { const out = []; let tot = 0; const by = new Map();
      for (const a of accsIn) { if (!by.has(a.pos)) by.set(a.pos, []); by.get(a.pos).push(a); }
      for (const p of POS) { const xs = by.get(p.id); if (!xs) continue; const v = xs.reduce((s, a) => s + val(a), 0); tot += v;
        out.push({ t: 'item', lvl, label: p.label, v }); if (opt.detail) for (const a of xs) if (!isZero(val(a))) out.push({ t: 'acc', lvl: lvl + 1, label: label(a), v: val(a) }); }
      return { out, tot }; };
    for (const d of DANA_ORDER) {
      const xs = fundAcc(d); const name = DANA[d].toUpperCase();
      const pIn = lines(xs.filter(a => POS_BY[a.pos].kind === 'in'), mv, 2);
      const pCut = lines(xs.filter(a => POS_BY[a.pos].kind === 'cut'), a => mv(a), 2);   // bagian amil: beban → negatif di blok penerimaan
      const pOut = lines(xs.filter(a => POS_BY[a.pos].kind === 'out'), a => -mv(a), 2);
      const eqMv = xs.filter(a => POS_BY[a.pos].kind === 'eq').reduce((s, a) => s + mv(a), 0);
      awal[d] = xs.reduce((s, a) => s - a.sa, 0);
      lpd.push({ t: 'h1', label: name }, { t: 'h2', lvl: 1, label: 'Penerimaan' }, ...pIn.out);
      if (!pIn.out.length) lpd.push({ t: 'item', lvl: 2, label: '—', v: 0 });
      lpd.push({ t: 'sub', lvl: 1, label: 'Jumlah penerimaan ' + DANA[d].toLowerCase(), v: pIn.tot });
      let netIn = pIn.tot;
      if (pCut.out.length) { lpd.push(...pCut.out); netIn += pCut.tot; lpd.push({ t: 'sub', lvl: 1, label: `Jumlah penerimaan ${DANA[d].toLowerCase()} setelah bagian amil`, v: netIn }); }
      lpd.push({ t: 'h2', lvl: 1, label: d === 'a' ? 'Penggunaan' : 'Penyaluran' }, ...pOut.out);
      if (!pOut.out.length) lpd.push({ t: 'item', lvl: 2, label: '—', v: 0 });
      lpd.push({ t: 'sub', lvl: 1, label: (d === 'a' ? 'Jumlah penggunaan ' : 'Jumlah penyaluran ') + DANA[d].toLowerCase(), v: pOut.tot });
      const surplus = netIn - pOut.tot;
      lpd.push({ t: 'sub2', lvl: 1, label: 'Surplus (defisit)', v: surplus });
      if (!isZero(eqMv)) lpd.push({ t: 'item', lvl: 1, label: 'Penambahan (pengurangan) langsung saldo dana', v: eqMv });
      akhir[d] = awal[d] + surplus + eqMv;
      lpd.push({ t: 'item', lvl: 1, label: 'Saldo awal', v: awal[d] }, { t: 'tot', label: 'Saldo akhir ' + DANA[d].toLowerCase(), v: akhir[d] }, { t: 'blank' });
    }
    if (fundUn.length) {
      const inMv = fundUn.reduce((s, a) => s + mv(a), 0), unAwal = fundUn.reduce((s, a) => s - a.sa, 0);
      lpd.push({ t: 'h1', label: 'BELUM DIPETAKAN', un: true });
      for (const a of fundUn) if (!isZero(mv(a))) lpd.push({ t: 'acc', lvl: 1, label: label(a), v: mv(a) });
      lpd.push({ t: 'sub2', lvl: 1, label: 'Mutasi periode', v: inMv }, { t: 'item', lvl: 1, label: 'Saldo awal', v: unAwal }, { t: 'tot', label: 'Saldo akhir dana belum dipetakan', v: unAwal + inMv }, { t: 'blank' });
    }
    lpd.push({ t: 'gt', label: 'JUMLAH SALDO DANA ZAKAT, DANA INFAK/SEDEKAH, DANA AMIL, DAN DANA NONHALAL', v: totDana });

    /* ---------- Laporan Perubahan Aset Kelolaan ---------- */
    const kelAll = list.filter(a => POS_BY[a.pos] && POS_BY[a.pos].kel);
    const assets = kelAll.filter(a => POS_BY[a.pos].col === 'nilai');
    const lpakRows = new Map(assets.map(a => [a.key, { a, grp: POS_BY[a.pos].kel, awal: a.sa, tambah: a.d, kurang: a.k, susut: 0, sisih: 0 }]));
    for (const a of kelAll.filter(a => POS_BY[a.pos].col !== 'nilai')) {
      const p = POS_BY[a.pos]; const lk = a.link && lpakRows.has(a.link) ? a.link : linkKel(a, assets.filter(x => POS_BY[x.pos].kel === p.kel).length ? assets.filter(x => POS_BY[x.pos].kel === p.kel) : assets);
      let row = lpakRows.get(lk);
      if (!row) { row = { a, grp: p.kel, awal: 0, tambah: 0, kurang: 0, susut: 0, sisih: 0, orphan: true }; lpakRows.set(a.key, row); }
      row[p.col] += -a.end;    // akumulasi bersaldo kredit → angka positif
    }
    const lpak = []; const LPAK_COLS = ['awal', 'tambah', 'kurang', 'susut', 'sisih', 'akhir'];
    const gsum = rs => Object.fromEntries(LPAK_COLS.map(c => [c, rs.reduce((s, r) => s + r[c], 0)]));
    const all = [];
    for (const [g, gl] of [['l', 'Aset kelolaan lancar'], ['tl', 'Aset kelolaan tidak lancar']]) {
      const rs = [...lpakRows.values()].filter(r => r.grp === g); if (!rs.length) continue;
      lpak.push({ t: 'h2', lvl: 0, label: gl });
      for (const r of rs) { r.akhir = r.awal + r.tambah - r.kurang - r.susut - r.sisih; const row = { t: 'item', lvl: 1, label: opt.detail ? label(r.a) : r.a.nama, awal: r.awal, tambah: r.tambah, kurang: r.kurang, susut: r.susut, sisih: r.sisih, akhir: r.akhir }; lpak.push(row); all.push(row); }
      lpak.push({ t: 'sub', lvl: 0, label: 'Jumlah ' + gl.toLowerCase(), ...gsum(rs) });
    }
    if (all.length) lpak.push({ t: 'tot', label: 'JUMLAH ASET KELOLAAN', ...gsum(all) });

    /* ---------- Laporan Arus Kas (metode langsung) ---------- */
    let lak = null, lakDiff = 0;
    const cashKeys = new Set(list.filter(a => POS_BY[a.pos] && POS_BY[a.pos].cash).map(a => a.key));
    if (kas) {
      const flow = new Map(); const accFlow = new Map(); const seen = new Set(); const tx = new Map();
      for (const r of kas) { const id = String(r.jurnal_id ?? ''); if (id && seen.has(id)) continue; if (id) seen.add(id);
        const t = String(r.transaction_id); if (!tx.has(t)) tx.set(t, []); tx.get(t).push(r); }
      for (const ls of tx.values()) {
        let cash = 0; const other = new Map();
        for (const r of ls) { const k = norm(r.kode_akun); const v = num(r.debit) - num(r.kredit);
          if (cashKeys.has(k)) cash += v; else { if (!A.has(k)) get(r.kode_akun, r.nama_akun, r.noklasifikasi); other.set(k, (other.get(k) || 0) - v); } }
        if (isZero(cash)) continue;
        const so = [...other.values()].reduce((s, v) => s + v, 0);
        if (isZero(so)) { flow.set('cf_o_lain', (flow.get('cf_o_lain') || 0) + cash); continue; }
        for (const [k, v] of other) { const a = A.get(k); const f = v * cash / so;
          const p = a ? (a.pos || '') : ''; const cf = (a && a.cf && CF_BY[a.cf]) ? a.cf : cfDefault(p, a && a.klsN);
          flow.set(cf, (flow.get(cf) || 0) + f);
          if (opt.detail) { const m = accFlow.get(cf) || new Map(); m.set(k, (m.get(k) || 0) + f); accFlow.set(cf, m); } }
      }
      lak = []; let net = 0;
      for (const act of ['o', 'i', 'f']) {
        const items = CF.filter(c => c.act === act && flow.has(c.id));
        lak.push({ t: 'h2', lvl: 0, label: ACT[act] }); let tot = 0;
        for (const c of items) { const v = flow.get(c.id); tot += v; lak.push({ t: 'item', lvl: 1, label: c.label, v });
          if (opt.detail) for (const [k, fv] of [...(accFlow.get(c.id) || new Map())].sort()) if (!isZero(fv)) lak.push({ t: 'acc', lvl: 2, label: label(A.get(k)), v: fv }); }
        if (!items.length) lak.push({ t: 'item', lvl: 1, label: '—', v: 0 });
        lak.push({ t: 'sub', lvl: 0, label: (act === 'o' ? 'Arus kas bersih dari aktivitas operasi' : act === 'i' ? 'Arus kas bersih dari aktivitas investasi' : 'Arus kas bersih dari aktivitas pendanaan'), v: tot }); net += tot;
      }
      const kasAwal = list.filter(a => cashKeys.has(a.key)).reduce((s, a) => s + a.sa, 0), kasAkhir = list.filter(a => cashKeys.has(a.key)).reduce((s, a) => s + a.end, 0);
      lak.push({ t: 'blank' }, { t: 'sub2', lvl: 0, label: 'Kenaikan (penurunan) bersih kas dan setara kas', v: net }, { t: 'item', lvl: 0, label: 'Kas dan setara kas awal periode', v: kasAwal }, { t: 'tot', label: 'KAS DAN SETARA KAS AKHIR PERIODE', v: kasAwal + net });
      lakDiff = r2(kasAkhir - kasAwal - net);
      if (!isZero(lakDiff)) { lak.push({ t: 'item', lvl: 0, label: 'Selisih dengan saldo kas di neraca', v: lakDiff, un: true }); warn.push(`Arus kas berselisih ${lakDiff.toLocaleString('id-ID')} dengan saldo kas di neraca — ada transaksi kas yang tidak terambil.`); }
      if (!cashKeys.size) warn.push('Belum ada akun yang dipetakan ke "Kas dan setara kas", jadi laporan arus kas kosong.');
    }
    const guessed = list.filter(a => active(a) && a.guessed && a.pos).length;
    return { lpk, lpd, lpak, lak, warn, unmapped: unmapped.map(a => ({ kode: a.kode, nama: a.nama })), guessed, accounts: list, check: { lpkDiff, lakDiff, totAset, totLiab, totDana, fundEnd, unEnd } };
  }

  return { DANA, DANA_ORDER, POS, POS_BY, POS_GROUPS, SECT, CF, CF_BY, ACT, posLabel, cfDefault, guess, resolve, klsOf, norm, build, LPAK_COLS: ['awal', 'tambah', 'kurang', 'susut', 'sisih', 'akhir'],
    LPAK_LABELS: { awal: 'Saldo awal', tambah: 'Penambahan', kurang: 'Pengurangan', susut: 'Akumulasi penyusutan', sisih: 'Akumulasi penyisihan', akhir: 'Saldo akhir' } };
});
