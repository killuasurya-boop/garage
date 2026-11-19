/* Daftar Mandiri GIGS 2026: sponsor, kreator/talent, crew.
   Data dikirim ke /api/public/*; pemilik menerima ID + kode edit pribadi.
   Link edit memakai fragmen URL (#edit=ID.KODE) agar tidak tercatat di log server. */
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('regForm');
  const tabs = [...document.querySelectorAll('.gigs-reg-tabs [data-type]')];
  const result = $('regResult');
  const message = $('regMessage');
  const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const COPY = {
    sponsor: {
      title: 'Pendaftaran Sponsor', name: 'Nama usaha / brand',
      lead: 'Isi profil usaha Anda. Kontribusi bukan untuk membeli posisi lebih tinggi: semua nominal mendapat hak promosi yang sama.',
    },
    creator: {
      title: 'Pendaftaran Kreator / Talent', name: 'Nama band / talent / komunitas', members: 'Jumlah personel',
      lead: 'Daftarkan band, komika, akustik, atau komunitas Anda. Profil tampil di Creative Community setelah disetujui panitia.',
    },
    crew: {
      title: 'Pendaftaran Crew / Tim pendukung', name: 'Nama tim', members: 'Jumlah orang dalam tim',
      lead: 'Isi jumlah orang yang ikut bertugas agar panitia bisa menghitung konsumsi. Satu formulir per tim.',
    },
  };
  let type = 'sponsor';
  let logoBase64 = '';
  let editing = null; // { id, code, entry }
  let config = { open: false };

  const req = (label) => `${label} <b class="gigs-req">*</b>`;

  function setType(next, { keepValues = false } = {}) {
    type = next;
    tabs.forEach((tab) => {
      const on = tab.dataset.type === type;
      tab.setAttribute('aria-selected', String(on));
      tab.classList.toggle('is-active', on);
      tab.disabled = Boolean(editing) && !on;
    });
    form.setAttribute('aria-labelledby', `tab-${type}`);
    form.querySelectorAll('[data-for]').forEach((el) => {
      el.hidden = !el.dataset.for.split(' ').includes(type);
    });
    $('regTitle').textContent = editing ? `Perbarui data · ${COPY[type].title.replace('Pendaftaran ', '')}` : COPY[type].title;
    $('regLead').textContent = COPY[type].lead;
    $('lblName').innerHTML = req(COPY[type].name);
    if (COPY[type].members) $('lblMembers').innerHTML = req(COPY[type].members);
    $('lblLogo').innerHTML = `${type === 'creator' ? 'Logo / foto grup' : 'Logo usaha'} ${editing ? '<em>(kosongkan jika tidak diganti)</em>' : '<b class="gigs-req">*</b>'} <em>(PNG/JPG/WebP, maks. 2 MB)</em>`;
    $('regSubmit').textContent = editing ? 'Simpan perubahan' : 'Kirim pendaftaran';
    if (!keepValues) message.textContent = '';
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => { if (!editing) setType(tab.dataset.type); }));
  tabs.forEach((tab, i) => tab.addEventListener('keydown', (e) => {
    if (editing || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    setType(next.dataset.type);
  }));

  // Nominal: rentang & target mengikuti Pusat Pengaturan panitia.
  const range = () => `${rupiah.format(config.sponsorMin || 300000)} – ${rupiah.format(config.sponsorMax || 20000000)}`;
  function amountHint() {
    const n = Number(form.elements.amount.value);
    const hint = $('amountHint');
    const min = config.sponsorMin || 300000;
    const max = config.sponsorMax || 20000000;
    const target = config.sponsorTarget || 17000000;
    if (!n) { hint.textContent = `${range()}. Semua nominal mendapat hak promosi yang sama.`; return; }
    let text = `${rupiah.format(n)} · hak promosi setara.`;
    if (n < min || n > max) text = `Nominal harus ${range()}.`;
    else if (n > target) text += ` Melebihi target ${rupiah.format(target)}; kelebihan dicatat terpisah dan tidak mengubah RAB.`;
    hint.textContent = text;
  }
  form.elements.amount.addEventListener('input', amountHint);
  function applyConfig() {
    form.elements.amount.min = String(config.sponsorMin || 300000);
    form.elements.amount.max = String(config.sponsorMax || 20000000);
    const tabNote = document.querySelector('#tab-sponsor small');
    if (tabNote) {
      tabNote.textContent = `${range()} · hak setara${config.sponsorSpotsLeft !== null && config.sponsorSpotsLeft !== undefined ? ` · sisa kuota ${config.sponsorSpotsLeft}` : ''}`;
    }
    amountHint();
  }

  $('regLogo').addEventListener('change', async () => {
    const file = $('regLogo').files?.[0];
    logoBase64 = '';
    const preview = $('regLogoPreview');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { message.textContent = 'Logo harus PNG, JPG, atau WebP.'; return; }
    if (file.size > 2 * 1024 * 1024) { message.textContent = 'Logo maksimal 2 MB.'; return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    logoBase64 = btoa(binary);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    $('regLogoText').textContent = file.name;
    message.textContent = '';
  });

  function collect() {
    const f = form.elements;
    const data = {
      type, name: f.name.value, pic: f.pic.value, whatsapp: f.whatsapp.value, instagram: f.instagram.value,
      description: f.description.value, consent: f.consent.checked,
    };
    if (type === 'sponsor') Object.assign(data, { category: f.sponsorCategory.value, address: f.address.value, amount: Number(f.amount.value) });
    if (type === 'creator') Object.assign(data, { category: f.creatorCategory.value, members: Number(f.members.value), portfolio: f.portfolio.value, tech: f.tech.value, diet: f.diet.value });
    if (type === 'crew') Object.assign(data, { role: f.role.value, members: Number(f.members.value), attendance: f.attendance.value, diet: f.diet.value });
    if (logoBase64) data.logo = logoBase64;
    return data;
  }

  function fill(entry) {
    const f = form.elements;
    f.name.value = entry.name || '';
    f.pic.value = entry.pic || '';
    f.whatsapp.value = entry.whatsapp ? `0${entry.whatsapp.slice(2)}` : '';
    f.instagram.value = entry.instagram ? `@${entry.instagram}` : '';
    f.description.value = entry.description || '';
    f.consent.checked = Boolean(entry.consent);
    f.sponsorCategory.value = entry.type === 'sponsor' ? entry.category : '';
    f.creatorCategory.value = entry.type === 'creator' ? entry.category : '';
    f.address.value = entry.address || '';
    f.amount.value = entry.amount || '';
    f.members.value = entry.members || '';
    f.role.value = entry.role || '';
    f.attendance.value = entry.attendance || '';
    f.portfolio.value = entry.portfolio || '';
    f.tech.value = entry.tech || '';
    f.diet.value = entry.diet || '';
    f.amount.dispatchEvent(new Event('input'));
  }

  async function api(path, payload) {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Layanan pendaftaran belum tersedia.');
    return data;
  }

  const STATUS = {
    diajukan: ['DIAJUKAN · menunggu peninjauan', 'gigs-badge-warning'],
    revisi: ['PERLU REVISI', 'gigs-badge-warning'],
    disetujui: ['DISETUJUI', 'gigs-badge-verified'],
    ditolak: ['DITOLAK', 'gigs-badge-rejected'],
  };
  function showStatus(entry) {
    const [label, cls] = STATUS[entry.status] || STATUS.diajukan;
    const badge = $('regStatus');
    badge.textContent = entry.published ? 'TAYANG DI WEBSITE' : label;
    badge.className = `gigs-badge ${entry.published ? 'gigs-badge-verified' : cls}`;
    // Kreator: tampilkan slot panggung yang sudah ditetapkan panitia.
    let slotNote = $('regSlot');
    if (!slotNote) {
      slotNote = document.createElement('p');
      slotNote.id = 'regSlot';
      slotNote.className = 'gigs-reg-hint';
      badge.parentElement.after(slotNote);
    }
    slotNote.textContent = entry.type === 'creator'
      ? (entry.slot ? `Slot tampil: ${entry.slot.name}${entry.slot.startTime ? ` · ${entry.slot.startTime} WIB` : ''}${entry.slot.durationMin ? ` · ${entry.slot.durationMin} menit` : ''}` : 'Slot tampil: belum ditetapkan panitia.')
      : '';
    slotNote.hidden = entry.type !== 'creator';
  }

  function editLink(id, code) {
    return `${location.origin}${window.GIGS_BASE || ''}/daftar#edit=${id}.${code}`;
  }

  // Progres hak (sponsor) & setlist (kreator) untuk pemegang ID + kode.
  const BENEFIT_ICON = { belum: '○ Belum', proses: '◐ Sedang dikerjakan', selesai: '● Selesai' };
  function renderExtras(entry) {
    const box = $('regExtras');
    const hasBenefits = Array.isArray(entry.benefits) && entry.benefits.length;
    const isCreator = entry.type === 'creator' && entry.status !== 'ditolak';
    box.hidden = !hasBenefits && !isCreator;
    $('regBenefits').hidden = !hasBenefits;
    $('regSetlist').hidden = !isCreator;
    if (hasBenefits) {
      const done = entry.benefits.filter((b) => b.status === 'selesai').length;
      $('regExtrasTitle').textContent = `Progres hak sponsor: ${done}/${entry.benefits.length} selesai`;
      $('regBenefitList').replaceChildren(...entry.benefits.map((b) => {
        const li = document.createElement('li');
        li.className = `is-${b.status}`;
        const name = document.createElement('span');
        name.textContent = b.label;
        const state = document.createElement('strong');
        state.textContent = BENEFIT_ICON[b.status] || b.status;
        li.append(name, state);
        if (b.evidence) {
          const a = document.createElement('a');
          a.href = b.evidence;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'Lihat bukti';
          li.append(a);
        }
        return li;
      }));
    }
    // Laporan sponsor (bab 29) — tampil setelah panitia merilisnya.
    const report = entry.report;
    $('regReport').hidden = !report;
    if (report) {
      $('regReportMeta').textContent = `${report.support === 'nonkas' ? `Dukungan barang/jasa: ${report.supportNote || '-'}` : (report.verifiedAmount ? `Kontribusi terverifikasi: ${rupiah.format(report.verifiedAmount)}` : 'Kontribusi: belum ada dana terverifikasi')} · dirilis ${new Date(report.releasedAt.replace(' ', 'T') + 'Z').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}`;
      $('regReportInsight').textContent = report.insight || '-';
      $('regReportNote').textContent = report.note || '-';
    }
    if (isCreator) {
      $('regExtrasTitle').textContent = 'Setlist penampilan';
      $('regSetlist').elements.songs.value = (entry.setlist || [])
        .map((s) => [s.title, s.writer, s.kind].filter(Boolean).join(' | ')).join('\n');
      $('regSetlistMsg').textContent = entry.setlist?.length ? `${entry.setlist.length} lagu tersimpan.` : '';
    }
  }

  $('regReportPrint').addEventListener('click', () => window.print());

  $('regSetlist').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editing) return;
    const msg = $('regSetlistMsg');
    const songs = event.target.elements.songs.value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [title, writer = '', kind = ''] = line.split('|').map((part) => part.trim());
      return { title, writer, kind: /^orig/i.test(kind) ? 'original' : 'cover' };
    });
    msg.textContent = 'Menyimpan…';
    try {
      const { setlist } = await api('/event/gigs-akhir-tahun-2026/api/public/registration/setlist', { id: editing.id, code: editing.code, setlist: songs });
      msg.textContent = `${setlist.length} lagu tersimpan. Terima kasih!`;
    } catch (error) {
      msg.textContent = error.message;
    }
  });

  function enterEdit(id, code, entry) {
    editing = { id, code, entry };
    renderExtras(entry);
    setType(entry.type, { keepValues: true });
    fill(entry);
    const note = $('regEditing');
    const [label] = STATUS[entry.status] || STATUS.diajukan;
    note.hidden = false;
    note.textContent = `Mengubah data "${entry.name}". Status saat ini: ${entry.published ? 'TAYANG DI WEBSITE' : label}.`
      + (entry.reviewNote ? ` Catatan panitia: ${entry.reviewNote}` : '')
      + ' Perubahan akan ditinjau ulang sebelum tayang.';
    form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('regSubmit');
    button.disabled = true;
    message.textContent = editing ? 'Menyimpan perubahan…' : 'Mengirim pendaftaran…';
    try {
      const data = collect();
      if (editing) {
        const entry = await api('/event/gigs-akhir-tahun-2026/api/public/registration/update', { ...data, id: editing.id, code: editing.code });
        editing.entry = entry;
        message.textContent = 'Perubahan tersimpan dan menunggu peninjauan ulang.';
        showResult(editing.id, editing.code, entry);
      } else {
        const created = await api('/event/gigs-akhir-tahun-2026/api/public/register', data);
        message.textContent = 'Pendaftaran terkirim. Simpan ID dan kode edit di bawah.';
        showResult(created.id, created.code, created.entry);
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  function showResult(id, code, entry) {
    $('regId').textContent = id;
    $('regCode').textContent = code;
    showStatus(entry);
    result.hidden = false;
    result.dataset.link = editLink(id, code);
    result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    $('regResultTitle').focus?.();
  }

  $('regCopyLink').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(result.dataset.link);
      $('regCopyLink').textContent = 'Link tersalin ✓';
    } catch {
      window.prompt('Salin link edit pribadi ini:', result.dataset.link);
    }
  });

  $('regNew').addEventListener('click', () => {
    editing = null;
    form.reset();
    logoBase64 = '';
    $('regLogoPreview').hidden = true;
    $('regLogoText').textContent = 'Pilih berkas';
    $('regEditing').hidden = true;
    $('regExtras').hidden = true;
    result.hidden = true;
    history.replaceState(null, '', '/event/gigs-akhir-tahun-2026/daftar');
    setType('sponsor');
    form.scrollIntoView();
  });

  $('regLookup').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = event.target.elements.id.value.trim();
    const code = event.target.elements.code.value.trim().toUpperCase();
    const note = $('lookupMessage');
    note.textContent = 'Memeriksa…';
    try {
      const entry = await api('/event/gigs-akhir-tahun-2026/api/public/registration/lookup', { id, code });
      note.textContent = '';
      enterEdit(id, code, entry);
    } catch (error) {
      note.textContent = error.message;
    }
  });

  async function boot() {
    try {
      config = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/config', { credentials: 'same-origin' })).json();
    } catch {
      config = { open: false };
    }
    if (!config.open) {
      $('regClosed').hidden = false;
      $('regApp').hidden = true;
      return;
    }
    applyConfig();
    if (config.locked) {
      $('regClosed').hidden = false;
      $('regClosed').textContent = 'Pendaftaran kreator dan crew sudah ditutup. Pendaftaran sponsor masih dibuka.';
    }
    // Tautan promosi bisa langsung membuka tab: ?tipe=sponsor | kreator | crew (tanpa data pribadi di URL).
    const TIPE = { sponsor: 'sponsor', umkm: 'sponsor', kreator: 'creator', creator: 'creator', talent: 'creator', crew: 'crew' };
    const fromUrl = TIPE[(new URLSearchParams(location.search).get('tipe') || '').toLowerCase()];
    setType(fromUrl && !(config.locked && fromUrl !== 'sponsor') ? fromUrl : 'sponsor');
    // Isian yang dibawa dari layar Sponsor/Kreator di beranda (sessionStorage, tidak lewat URL).
    try {
      const prefill = JSON.parse(sessionStorage.getItem('gigs2026_prefill') || 'null');
      sessionStorage.removeItem('gigs2026_prefill');
      if (prefill && ['sponsor', 'creator', 'crew'].includes(prefill.type)) {
        setType(prefill.type);
        for (const [name, value] of Object.entries(prefill.fields || {})) {
          const field = form.elements[name];
          if (field && value !== '' && value != null) field.value = String(value);
        }
        form.elements.amount?.dispatchEvent(new Event('input'));
        message.textContent = 'Data dari halaman sebelumnya sudah terisi. Lengkapi kolom bertanda * lalu kirim.';
        form.scrollIntoView();
      }
    } catch {}
    if (location.hash === '#cek') $('regLookup').scrollIntoView();
    const match = /^#edit=([0-9a-f-]{36})\.([0-9A-F]{12})$/i.exec(location.hash);
    if (match) {
      try {
        const entry = await api('/event/gigs-akhir-tahun-2026/api/public/registration/lookup', { id: match[1], code: match[2].toUpperCase() });
        enterEdit(match[1], match[2].toUpperCase(), entry);
      } catch (error) {
        message.textContent = error.message;
      }
    }
  }
  boot();
})();
