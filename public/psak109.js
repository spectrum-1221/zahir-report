/* Zahir Insight — laporan PSAK 109 dari custom query bawaan (neraca_psak109, laporan_aktivitas_psak109, perubahan_dana_psak109,
   arus_kas_langsung, arus_kas_tidak_langsung, catatan_atas_laporan_keuangan). Susunan grup, subtotal dan ringkasan mengikuti
   template Jasper Zahir Online yang setara. Fungsi murni (tanpa DOM/jaringan): dipakai browser dan bisa diuji di Node.
   Keluaran: { cols, rows } — rows: {t, lvl, kode, label, v | vals[]}
   t: h1/h2/h3 (judul grup), item (baris akun), sub (subtotal grup), sub0 (total grup teratas), tot (total ringkasan), gt (total akhir), note, blank */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Psak109 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const str = v => v == null ? '' : String(v);
  const cap = s => { s = str(s); return s ? s.charAt(0) + s.slice(1).toLowerCase() : ''; };
  // kelompokkan baris berurutan menurut kunci (urutan dari query dipertahankan)
  function groups(rows, key) { const out = []; let cur = null; for (const r of rows) { const k = key(r); if (!cur || cur.k !== k) { cur = { k, r, rows: [] }; out.push(cur); } cur.rows.push(r); } return out; }
  const sum = (rows, f) => rows.reduce((s, r) => s + num(f(r)), 0);
  const item = (r, lvl, v) => ({ t: 'item', lvl, kode: str(r.akun_kode), label: str(r.akun_nama), v: v === undefined ? num(r.nilai) : v });
  const ONE = [{ k: 'kode', label: 'Kode' }, { k: 'label', label: 'Nama Akun' }, { k: 'v', label: 'Nilai', num: true }];

  // Laporan Posisi Keuangan (Neraca): kelompok → subkelompok → akun; JUMLAH ASET (kelompok 1) vs LIABILITAS DAN DANA (kelompok ≥ 2)
  function neraca(rows) {
    const out = [];
    for (const g of groups(rows, r => str(r.kelompok))) {
      out.push({ t: 'h1', lvl: 0, label: g.k });
      for (const s of groups(g.rows, r => str(r.subkelompok))) {
        out.push({ t: 'h2', lvl: 1, label: s.k });
        for (const r of s.rows) out.push(item(r, 2));
        out.push({ t: 'sub', lvl: 1, label: 'Total ' + s.k, v: sum(s.rows, r => r.nilai) });
      }
      out.push({ t: 'sub0', lvl: 0, label: 'Total ' + g.k, v: sum(g.rows, r => r.nilai) }, { t: 'blank' });
    }
    const aset = sum(rows.filter(r => num(r.kelompok_urut) === 1), r => r.nilai), pasiva = sum(rows.filter(r => num(r.kelompok_urut) >= 2), r => r.nilai);
    out.push({ t: 'tot', lvl: 0, label: 'JUMLAH ASET', v: aset }, { t: 'tot', lvl: 0, label: 'JUMLAH LIABILITAS DAN DANA', v: pasiva }, { t: 'note', lvl: 0, label: 'Selisih (harus = 0)', v: aset - pasiva });
    return { cols: ONE, rows: out, check: { aset, pasiva } };
  }

  // Laporan Aktivitas (Perubahan Dana): dana → Penghasilan/Beban → subklasifikasi → akun; per dana: surplus, saldo awal, saldo akhir
  function aktivitas(rows) {
    const out = []; let grand = 0;
    for (const d of groups(rows, r => str(r.dana))) {
      const nama = d.k || '(Tanpa Dana)';
      out.push({ t: 'h1', lvl: 0, label: nama.toUpperCase() });
      for (const s of groups(d.rows, r => str(r.section))) {
        out.push({ t: 'h2', lvl: 1, label: s.k });
        for (const k of groups(s.rows, r => str(r.subklas))) {
          out.push({ t: 'h3', lvl: 2, label: k.k });
          for (const r of k.rows) out.push(item(r, 3));
          out.push({ t: 'sub', lvl: 2, label: 'Total ' + k.k, v: sum(k.rows, r => r.nilai) });
        }
        out.push({ t: 'sub', lvl: 1, label: 'Total ' + s.k, v: sum(s.rows, r => r.nilai) });
      }
      const peng = sum(d.rows.filter(r => num(r.section_urut) === 1), r => r.nilai), beban = sum(d.rows.filter(r => num(r.section_urut) === 2), r => r.nilai);
      const surplus = peng - beban, akhir = num(d.rows[0].saldo_akhir_dana); grand += akhir;
      out.push({ t: 'sub0', lvl: 0, label: 'Total ' + nama.toUpperCase(), v: surplus }, { t: 'item', lvl: 0, label: 'Surplus (Defisit)', v: surplus, b: true },
        { t: 'item', lvl: 0, label: 'Saldo Awal', v: akhir - surplus, b: true }, { t: 'tot', lvl: 0, label: 'Saldo Akhir', v: akhir }, { t: 'blank' });
    }
    out.push({ t: 'gt', lvl: 0, label: 'Total Saldo Akhir Seluruh Dana', v: grand });
    return { cols: ONE, rows: out };
  }

  // Perubahan dana per dana (cost code): penerimaan (kredit), penyaluran (debit), mutasi bersih per akun
  function perubahanDana(rows) {
    const cols = [{ k: 'kode', label: 'Kode' }, { k: 'label', label: 'Nama Akun' }, { k: 0, label: 'Penerimaan', num: true }, { k: 1, label: 'Penyaluran', num: true }, { k: 2, label: 'Mutasi Bersih', num: true }];
    const out = []; const F = ['penerimaan', 'penyaluran', 'mutasi_bersih'];
    for (const d of groups(rows, r => str(r.dana_nama))) {
      out.push({ t: 'h1', lvl: 0, label: (d.k || '(Tanpa Dana)').toUpperCase() });
      for (const r of d.rows) out.push({ t: 'item', lvl: 1, kode: str(r.akun_kode), label: str(r.akun_nama), vals: F.map(f => num(r[f])) });
      out.push({ t: 'sub0', lvl: 0, label: 'Total ' + (d.k || '(Tanpa Dana)'), vals: F.map(f => sum(d.rows, r => r[f])) }, { t: 'blank' });
    }
    out.push({ t: 'gt', lvl: 0, label: 'TOTAL SELURUH DANA', vals: F.map(f => sum(rows, r => r[f])) });
    return { cols, rows: out };
  }

  // Arus kas: section (→ blok untuk metode tidak langsung) → akun; ringkasan: arus kas bersih, saldo awal (= akhir − bersih), saldo akhir
  function arusKas(rows, indirect) {
    const out = [];
    for (const s of groups(rows, r => str(r.section))) {
      out.push({ t: 'h1', lvl: 0, label: s.k });
      for (const b of groups(s.rows, r => indirect ? str(r.blok) : '')) {
        if (b.k) out.push({ t: 'h2', lvl: 1, label: b.k });
        for (const r of b.rows) out.push(item(r, b.k ? 2 : 1));
      }
      out.push({ t: 'sub0', lvl: 0, label: (indirect ? 'Kas Bersih - ' : 'Total ') + cap(s.k), v: sum(s.rows, r => r.nilai) }, { t: 'blank' });
    }
    const net = sum(rows, r => r.nilai), akhir = rows.length ? num(rows[0].kas_akhir) : 0;
    out.push({ t: 'tot', lvl: 0, label: indirect ? 'Kenaikan (Penurunan) Bersih Kas' : 'Arus Kas Bersih', v: net },
      { t: 'item', lvl: 0, label: 'Saldo Kas dan Setara Kas Awal', v: akhir - net, b: true }, { t: 'gt', lvl: 0, label: 'Saldo Kas dan Setara Kas Akhir', v: akhir });
    return { cols: ONE, rows: out };
  }

  // Catatan atas Laporan Keuangan: klasifikasi → nomor catatan (subklasifikasi 4 digit) → subklasifikasi 6 digit (bila lebih dari satu) → akun
  function calk(rows) {
    const out = [];
    for (const k of groups(rows, r => str(r.kl_no))) {
      const kn = str(k.r.kl_nama).toUpperCase();
      out.push({ t: 'h1', lvl: 0, label: kn });
      for (const g4 of groups(k.rows, r => str(r.g4_kode))) {
        const nm = str(g4.r.g4_nama);
        out.push({ t: 'h2', lvl: 1, label: (g4.r.note_no != null ? g4.r.note_no + '. ' : '') + nm });
        for (const g6 of groups(g4.rows, r => str(r.g6_kode))) {
          const show = str(g6.r.show_sub) === 'Y', n6 = str(g6.r.g6_nama).toUpperCase();
          if (show) out.push({ t: 'h3', lvl: 2, label: n6 });
          for (const r of g6.rows) out.push(item(r, show ? 3 : 2));
          if (show) out.push({ t: 'sub', lvl: 2, label: 'Total ' + n6, v: sum(g6.rows, r => r.nilai) });
        }
        out.push({ t: 'sub', lvl: 1, label: 'Total ' + nm, v: sum(g4.rows, r => r.nilai) });
      }
      out.push({ t: 'sub0', lvl: 0, label: 'TOTAL ' + kn, v: sum(k.rows, r => r.nilai) }, { t: 'blank' });
    }
    return { cols: ONE, rows: out };
  }

  const KINDS = {
    neraca: { build: neraca, title: 'LAPORAN POSISI KEUANGAN (NERACA)', per: 'asof' },
    aktivitas: { build: aktivitas, title: 'LAPORAN AKTIVITAS (PERUBAHAN DANA) - PSAK 109', per: 'range' },
    perubahan_dana: { build: perubahanDana, title: 'LAPORAN PERUBAHAN DANA PER DANA - PSAK 109', per: 'range' },
    ak_langsung: { build: r => arusKas(r, false), title: 'LAPORAN ARUS KAS (METODE LANGSUNG) - PSAK 109', per: 'range' },
    ak_tl: { build: r => arusKas(r, true), title: 'LAPORAN ARUS KAS (METODE TIDAK LANGSUNG) - PSAK 109', per: 'range' },
    calk: { build: calk, title: 'CATATAN ATAS LAPORAN KEUANGAN - PSAK 109', per: 'all' },
  };
  return { KINDS, build: (kind, rows) => KINDS[kind].build(rows || []), num };
});
