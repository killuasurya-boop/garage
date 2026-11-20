/* ==========================================================================
   GIGS AKHIR TAHUN 2026 — Interactive Controller & Motion Engine
   Implements SOP V1.3 Truthful Default + Reference Visual Simulation Modes
   Motion: Staggered cubic-bezier(0.22,1,0.36,1), Spring WAAPI, Count-up rAF, Oil-Motion
   ========================================================================== */

(() => {
  'use strict';

  const FORMAT_IDR = (amount) => {
    const num = Math.round(Number(amount) || 0);
    return 'Rp' + num.toLocaleString('id-ID');
  };

  // Verified SOP V1.3 datasets + Reference visual showcase datasets
  const PROGRAMS = [
    { id: 'band', title: 'BAND LOKAL', photo: '/event/gigs-akhir-tahun-2026/photos/prog-1.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/guitar.svg' },
    { id: 'standup', title: 'STAND-UP COMEDY', photo: '/event/gigs-akhir-tahun-2026/photos/prog-2.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/microphone.svg' },
    { id: 'akustik', title: 'LIVE ACOUSTIC', photo: '/event/gigs-akhir-tahun-2026/photos/prog-3.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/music.svg' },
    { id: 'games', title: 'GAMES INTERAKTIF', photo: '/event/gigs-akhir-tahun-2026/photos/prog-4.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/gamepad.svg' },
    { id: 'merch', title: 'MERCHANDISE EVENT', photo: '/event/gigs-akhir-tahun-2026/photos/prog-5.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/shirt.svg' },
    { id: 'umkm', title: 'KOLABORASI UMKM', photo: '/event/gigs-akhir-tahun-2026/photos/prog-6.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/handshake.svg' },
  ];

  const LINEUPS = [
    {
      slot: 'LINEUP // 01',
      name: 'LOST SIDE',
      role: 'OFFICIAL LINEUP',
      sub: 'Heavy / Metallic Roster',
      photo: '/event/gigs-akhir-tahun-2026/photos/lineup-1.jpg',
      logo: '/event/gigs-akhir-tahun-2026/official-assets/lineup/lost-side.jpg',
      logoMode: 'is-logo-blend',
    },
    {
      slot: 'LINEUP // 02',
      name: 'SURAI',
      role: 'OFFICIAL LINEUP',
      sub: 'Underground Stage Unit',
      photo: '/event/gigs-akhir-tahun-2026/photos/lineup-2.jpg',
      logo: '/event/gigs-akhir-tahun-2026/official-assets/lineup/surau.png',
      logoMode: 'is-logo-red',
    },
    {
      slot: 'LINEUP // 03',
      name: 'DIVISIVE',
      role: 'OFFICIAL LINEUP',
      sub: 'Alternative Showcase',
      photo: '/event/gigs-akhir-tahun-2026/photos/lineup-3.jpg',
      logo: '/event/gigs-akhir-tahun-2026/official-assets/lineup/divisive.png',
      logoMode: 'is-logo-light',
    },
    {
      slot: 'LINEUP // 04',
      name: 'STAND OUT',
      role: 'OFFICIAL LINEUP',
      sub: 'High-Energy Performer',
      photo: '/event/gigs-akhir-tahun-2026/photos/lineup-4.jpg',
      logo: '/event/gigs-akhir-tahun-2026/official-assets/lineup/stand-out.jpg',
      logoMode: 'is-logo-screen',
    },
    {
      slot: 'SLOT // 05',
      name: 'NEXT TALENT?',
      role: 'OPEN SUBMISSION',
      sub: 'Daftar Gratis Sekarang →',
      photo: '/event/gigs-akhir-tahun-2026/photos/lineup-5.jpg',
      logo: '',
      logoMode: 'is-open-slot',
      isCta: true,
    },
  ];

  let RAB_ITEMS = [
    { no: '01', pos: 'Band', shortPos: 'Band', budget: 3200000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Honor band lokal yang tampil (kontrak & bukti bayar).' },
    { no: '02', pos: 'Sound', shortPos: 'Sound System', budget: 4500000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Sewa sound system dari vendor (quotation & serah terima).' },
    { no: '03', pos: 'Lighting Acara', shortPos: 'Lighting Acara', budget: 1000000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Pencahayaan panggung dengan pemasangan yang aman.' },
    { no: '04', pos: 'Stand-up Comedy', shortPos: 'Stand-up Comedy', budget: 1200000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Honor komika lokal Tebing Tinggi.' },
    { no: '05', pos: 'Crew Penyelenggara (7 orang)', shortPos: 'Crew (7 orang)', budget: 3000000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Nilai total untuk 7 crew, bukan biaya per orang.' },
    { no: '06', pos: 'Kembang Api', shortPos: 'Kembang Api', budget: 1000000, status: 'Perlu Verifikasi Keamanan', badge: 'warning', purpose: 'Hanya dipakai setelah keputusan keselamatan & izin.' },
    { no: '07', pos: 'Dokumentasi', shortPos: 'Dokumentasi', budget: 500000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Foto & video acara, hasil diserahkan ke panitia.' },
    { no: '08', pos: 'Save Money', shortPos: 'Save Money', budget: 1000000, status: 'Menunggu Konfirmasi', badge: 'warning', purpose: 'Simpanan cadangan, bukan biaya. Dipakai hanya setelah disetujui.' },
    { no: '09', pos: 'MC (2 orang)', shortPos: 'MC (2 orang)', budget: 1200000, status: 'Belum Realisasi', badge: 'draft', purpose: 'Honor total 2 MC (kontrak & cue sheet).' },
  ];

  const FINANCE_MODES = {
    verified: {
      label: 'PRATINJAU RAB SOP V1.3',
      isSim: false,
      collected: 0,
      expense: 0,
      pct: 0,
      sponsorCount: 0,
      sponsorPending: 0,
      updateText: 'Ledger belum terhubung',
      realisasi: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      sponsors: [
        { name: 'GARAGE COFFEE', sub: 'Tuan Rumah Venue', verified: true },
        { name: 'SLOT UMKM 02', sub: 'NEED_OFFICIAL_LOGO', verified: false },
        { name: 'SLOT UMKM 03', sub: 'NEED_OFFICIAL_LOGO', verified: false },
        { name: 'SLOT UMKM 04', sub: 'NEED_OFFICIAL_LOGO', verified: false },
        { name: 'SLOT UMKM 05', sub: 'NEED_OFFICIAL_LOGO', verified: false },
        { name: '+ JADI SPONSOR', sub: 'Manfaat Setara', verified: false },
      ],
    },
    sim56: {
      label: 'SIMULASI REFERENSI (32.9%)',
      isSim: true,
      collected: 5600000,
      expense: 2100000,
      pct: 32.9,
      sponsorCount: 4,
      sponsorPending: 2,
      updateText: 'Simulasi Ref 01: 4 sponsor contoh',
      realisasi: [800000, 900000, 400000, 0, 0, 0, 0, 0, 0],
      sponsors: [
        { name: 'GARAGE COFFEE', sub: 'Venue Partner', verified: true },
        { name: 'DESAIN AJA DULU', sub: 'Simulasi Ref', verified: true },
        { name: 'ESKRIM POKAT AU', sub: 'Simulasi Ref', verified: true },
        { name: 'DIMSUM CIDUT', sub: 'Simulasi Ref', verified: true },
        { name: 'GG GAMING', sub: 'Simulasi Ref', verified: false },
        { name: 'MISOP BUK TURAH', sub: 'Simulasi Ref', verified: false },
      ],
    },
    sim50: {
      label: 'SIMULASI REFERENSI (50%)',
      isSim: true,
      collected: 8500000,
      expense: 5400000,
      pct: 50.0,
      sponsorCount: 5,
      sponsorPending: 1,
      updateText: 'Simulasi Ref 05: Progres 50%',
      realisasi: [2000000, 1800000, 600000, 0, 600000, 0, 400000, 0, 0],
      sponsors: [
        { name: 'GARAGE COFFEE', sub: 'Venue Partner', verified: true },
        { name: 'DESAIN AJA DULU', sub: 'Simulasi Ref', verified: true },
        { name: 'ESKRIM POKAT AU', sub: 'Simulasi Ref', verified: true },
        { name: 'DIMSUM CIDUT', sub: 'Simulasi Ref', verified: true },
        { name: 'GG GAMING', sub: 'Simulasi Ref', verified: true },
        { name: '+ JADI SPONSOR', sub: 'Terbuka', verified: false },
      ],
    },
    sim57: {
      label: 'SIMULASI REFERENSI (57.6%)',
      isSim: true,
      collected: 9800000,
      expense: 5900000,
      pct: 57.6,
      sponsorCount: 6,
      sponsorPending: 0,
      updateText: 'Simulasi Mobile Ref: 57.6%',
      realisasi: [2200000, 2100000, 600000, 0, 600000, 0, 400000, 0, 0],
      sponsors: [
        { name: 'DESAIN AJA DULU', sub: 'Simulasi Ref', verified: true },
        { name: 'GARAGE COFFEE', sub: 'Venue Partner', verified: true },
        { name: 'ESKRIM POKAT AU', sub: 'Simulasi Ref', verified: true },
        { name: 'DIMSUM CIDUT', sub: 'Simulasi Ref', verified: true },
        { name: 'GG GAMING', sub: 'Simulasi Ref', verified: true },
        { name: 'MISOP BUK TURAH', sub: 'Simulasi Ref', verified: true },
      ],
    },
  };

  const ORGANIZERS = [
    { name: 'OJAK', role: 'Audience Coordinator', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-1-ojak.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/users.svg' },
    { name: 'ROBBY', role: 'MC & Audience Lead', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-2-robby.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/microphone.svg' },
    { name: 'SYAHPUTRA', role: 'Assistant Project Manager', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-3-syahputra.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/briefcase.svg', featured: true },
    { name: 'ACE', role: 'Talent Coordinator', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-4-ace.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/star.svg' },
    { name: 'RAFLY', role: 'Stage Management', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-5-rafly.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons-extra/icon-stage.svg' },
    { name: 'ARESS', role: 'Documentation Lead', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-6-aress.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/camera.svg' },
    { name: 'BIMA', role: 'Documentation Helper', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-7-bima.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/video.svg' },
    { name: 'ANGGA', role: 'Tim Penyelenggara', photo: '/event/gigs-akhir-tahun-2026/photos/org-v2-8-angga.jpg', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/guitar.svg' },
  ];

  const RANGKAIAN_ACARA = [
    { id: 'band-lokal', title: 'Band Lokal', line1: 'Band', line2: 'Lokal', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/guitar.svg' },
    { id: 'standup-comedy', title: 'Stand-up Comedy', line1: 'Stand-up', line2: 'Comedy', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/microphone.svg' },
    { id: 'live-acoustic', title: 'Live Acoustic', line1: 'Live', line2: 'Acoustic', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/guitar.svg' },
    { id: 'games-interaktif', title: 'Games Interaktif', line1: 'Games', line2: 'Interaktif', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/gamepad.svg' },
    { id: 'merchandise-resmi', title: 'Merchandise Resmi', line1: 'Merchandise', line2: 'Resmi', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/shirt.svg' },
  ];

  const MEDIA_HIGHLIGHTS = [
    {
      id: 'highlight-event',
      title: 'HIGHLIGHT EVENT',
      tag: '01 // AFTERMOVIE',
      duration: '01:45',
      photo: '/event/gigs-akhir-tahun-2026/photos/media-1.jpg',
      featured: true,
      desc: 'Rekaman atmosfer panggung, energi penonton malam puncak, dan kolaborasi musisi lokal Tebing Tinggi bersama tim dokumentasi Aress & Bima.',
    },
    {
      id: 'interview-sponsor',
      title: 'INTERVIEW SPONSOR',
      tag: '02 // PARTNER TALK',
      duration: '02:10',
      photo: '/event/gigs-akhir-tahun-2026/photos/media-2.jpg',
      featured: false,
      desc: 'Sesi wawancara eksklusif bareng pemilik brand & UMKM lokal yang mendukung gerakan kreatif GIGS Akhir Tahun 2026.',
    },
    {
      id: 'creator-bts',
      title: 'CREATOR BEHIND SCENES',
      tag: '03 // BACKSTAGE',
      duration: '01:30',
      photo: '/event/gigs-akhir-tahun-2026/photos/media-3.jpg',
      featured: false,
      desc: 'Di balik layar persiapan produksi, soundcheck band, kurasi komika bersama Ace, hingga set panggung bersama Rafly.',
    },
    {
      id: 'teaser-2026',
      title: 'TEASER GIGS 2026',
      tag: '04 // OFFICIAL TEASER',
      duration: '00:55',
      photo: '/event/gigs-akhir-tahun-2026/photos/media-4.jpg',
      featured: false,
      desc: 'Cuplikan resmi menuju malam puncak GIGS Akhir Tahun 2026 di Garage Coffee, Jl. Mayjen Sutoyo, Tebing Tinggi.',
    },
  ];

  const CREATOR_CATEGORIES = [
    { key: 'band', label: 'BAND (SOLO/GRUP)', short: 'BAND LOKAL', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/guitar.svg', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-1.jpg' },
    { key: 'komika', label: 'STAND-UP COMEDY', short: 'KOMIKA', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/microphone.svg', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-2.jpg' },
    { key: 'akustik', label: 'LIVE AKUSTIK', short: 'AKUSTIK', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/music.svg', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-3.jpg' },
    { key: 'kreator', label: 'KONTEN KREATOR', short: 'KREATOR', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/camera.svg', photo: '/event/gigs-akhir-tahun-2026/photos/media-3.jpg' },
    { key: 'komunitas', label: 'KOMUNITAS KREATIF', short: 'KOMUNITAS', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/users.svg', photo: '/event/gigs-akhir-tahun-2026/photos/media-4.jpg' },
    { key: 'lainnya', label: 'KATEGORI LAINNYA', short: 'LAINNYA', icon: '/event/gigs-akhir-tahun-2026/gigs-svg/icons/plus.svg', photo: '/event/gigs-akhir-tahun-2026/photos/prog-4.jpg' },
  ];

  const COMMUNITY_MEMBERS = [
    { name: 'LOST SIDE', cat: 'band', tag: 'Official Lineup #01', photo: '/event/gigs-akhir-tahun-2026/official-assets/lineup/lost-side.jpg' },
    { name: 'SURAI', cat: 'band', tag: 'Official Lineup #02', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-2.jpg' },
    { name: 'DIVISIVE', cat: 'band', tag: 'Official Lineup #03', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-3.jpg' },
    { name: 'STAND OUT', cat: 'band', tag: 'Official Lineup #04', photo: '/event/gigs-akhir-tahun-2026/official-assets/lineup/stand-out.jpg' },
    { name: 'KOMIKA LOKAL', cat: 'komika', tag: 'Open Submission', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-2.jpg' },
  ];

  // Native SVG inventory
  const SVG_INVENTORY = {
    backgrounds: [
      'bg-card-stage', 'bg-creator-portal', 'bg-dark-grit', 'bg-footer-crowd',
      'bg-header-ribbon', 'bg-hero-cinematic', 'bg-mobile-hero', 'bg-paper-cream',
      'bg-sidebar-grit', 'bg-sponsor-portal', 'bg-stage-black-red', 'bg-transparency-finance',
    ],
    gradients: [
      'grad-black-panel', 'grad-card-dark', 'grad-cream-paper', 'grad-light-streak',
      'grad-paper-muted', 'grad-red-ember', 'grad-red-hero', 'grad-sponsor-intense',
    ],
    textures: [
      'texture-brush-dry-red', 'texture-film-grain-cream', 'texture-film-grain-red',
      'texture-grid-light', 'texture-halftone-red', 'texture-ink-splatter',
      'texture-paper-fibers', 'texture-print-scratches',
    ],
    effects: [
      'accent-slash', 'angled-underline', 'arrow-brush', 'black-red-stripes',
      'corner-shard', 'crown-scribble', 'diagonal-divider', 'diagonal-ticket-edge',
      'dot-grid', 'fx-directional-speed-lines', 'fx-dual-red-orbs', 'fx-ember-dots',
      'fx-flash-burst', 'fx-laser-horizontal', 'fx-light-leak-top', 'fx-neon-underline',
      'fx-red-edge-left', 'fx-red-edge-right', 'fx-red-radial-orb', 'fx-red-vignette',
      'fx-spotlight-beam-left', 'fx-spotlight-beam-right', 'fx-stage-backlight',
      'grain-overlay', 'halftone-dots', 'red-glow', 'slash-triple', 'stage-beams', 'status-outline',
    ],
    geometry: [
      'shape-angular-frame', 'shape-arrow-large', 'shape-brush-underline', 'shape-chevron-flag',
      'shape-red-corner-left', 'shape-red-corner-right', 'shape-ribbon-diagonal', 'shape-section-cut',
      'shape-sticker-outline', 'shape-ticker-strip', 'shape-triple-slashes', 'shape-zigzag',
    ],
    'ui-shells': [
      'ui-badge-draft', 'ui-badge-pending', 'ui-badge-rejected', 'ui-badge-review',
      'ui-badge-verified', 'ui-button-cream', 'ui-button-ghost', 'ui-button-outline',
      'ui-button-primary', 'ui-card-charcoal', 'ui-card-cream', 'ui-card-red',
      'ui-input-cream', 'ui-kpi-cream', 'ui-kpi-red', 'ui-mobile-drawer',
      'ui-modal-dark', 'ui-progress-fill', 'ui-progress-track', 'ui-sidebar-active-item',
      'ui-stage-label', 'ui-tab-active', 'ui-tab-outline', 'ui-table-header',
      'ui-table-total', 'ui-ticket-tag', 'ui-upload-dropzone',
    ],
    'icons-extra': [
      'icon-audit-log', 'icon-badge', 'icon-calendar-event', 'icon-chart-donut',
      'icon-circle-check', 'icon-circle-cross', 'icon-circle-pending', 'icon-clipboard-check',
      'icon-coin-stack', 'icon-community-group', 'icon-credit-card', 'icon-film-reel',
      'icon-instagram', 'icon-list-filter', 'icon-qr-code', 'icon-receipt',
      'icon-shield-check', 'icon-speaker', 'icon-stage', 'icon-tiktok',
      'icon-whatsapp', 'icon-youtube',
    ],
    icons: [
      'arrow-down', 'arrow-right', 'arrow-up-right', 'bell', 'briefcase', 'calendar', 'camera', 'chart',
      'check', 'chevron-down', 'clock', 'close', 'download', 'edit', 'external', 'file', 'filter',
      'finance', 'gamepad', 'guitar', 'handshake', 'home', 'info', 'layers', 'list', 'lock',
      'logout', 'menu', 'microphone', 'music', 'pin', 'play', 'plus', 'question', 'receipt', 'save',
      'search', 'shield', 'shirt', 'star', 'target', 'ticket', 'upload', 'user', 'users', 'video',
      'wallet', 'warning',
    ],
    frames: ['frame-card-dark', 'frame-cream', 'frame-ticket'],
    decor: ['hero-open-hand'],
  };

  const state = {
    screen: 'home',
    mode: 'verified',
    reducedMotion: false,
    selectedCreatorCat: 'band',
    communityFilter: 'all',
    svgCategory: 'all',
    svgSearch: '',
    modalTab: 'login',
  };

  let revealObserver = null;

  function isMotionEnabled() {
    return !state.reducedMotion;
  }

  // Smooth number count-up via cubic-out requestAnimationFrame
  function animateCounter(el, target, formatter) {
    if (!el) return;
    const from = Number(el.dataset.currentValue || 0);
    el.dataset.currentValue = String(target);
    // Tab tersembunyi tidak menjalankan animasi: pasang angka akhir langsung agar tidak tertahan di Rp0.
    if (!isMotionEnabled() || from === target || document.hidden) {
      el.textContent = formatter(target);
      return;
    }
    const duration = 950;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = from + (target - from) * eased;
      el.textContent = formatter(current);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = formatter(target);
    };
    requestAnimationFrame(tick);
    // Pengaman: bila browser menahan animasi, angka akhir tetap tampil.
    setTimeout(() => {
      if (el.dataset.currentValue === String(target)) el.textContent = formatter(target);
    }, duration + 150);
  }

  // Spring physics click pulse using Web Animations API
  function attachSpringClicks() {
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('.gigs-spring-btn, .gigs-card-hover');
      if (!btn || !isMotionEnabled() || typeof btn.animate !== 'function') return;
      btn.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(0.965)', offset: 0.25 },
          { transform: 'scale(1.028)', offset: 0.68 },
          { transform: 'scale(1)' },
        ],
        { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    });
  }

  // IntersectionObserver staggered reveal (y: 20px -> 0)
  function setupRevealObserver() {
    if (revealObserver) revealObserver.disconnect();
    const targets = document.querySelectorAll('.gigs-reveal');
    if (!isMotionEnabled() || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.style.setProperty('--reveal-delay', el.dataset.delay || '0');
          el.classList.add('is-visible');
          revealObserver.unobserve(el);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );
    targets.forEach((el) => revealObserver.observe(el));
  }

  // Reveal elements immediately inside the currently active screen if above fold
  function revealActiveScreenImmediate() {
    const active = document.getElementById(`screen-${state.screen}`);
    if (!active) return;
    active.querySelectorAll('.gigs-reveal').forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 120) {
        el.style.setProperty('--reveal-delay', el.dataset.delay || String(idx % 4));
        el.classList.add('is-visible');
      }
    });
  }

  // Render static & dynamic cards
  function renderPrograms() {
    const grid = document.getElementById('programGrid');
    if (!grid) return;
    grid.innerHTML = PROGRAMS.map(
      (item, idx) => `
      <article class="gigs-prog-card gigs-card-hover gigs-reveal" data-delay="${idx % 4}" aria-label="${item.title}" title="${item.title}">
        <img src="${item.photo}" alt="${item.title}" class="gigs-prog-photo" loading="lazy" />
        <span class="gigs-prog-badge" aria-hidden="true">
          <img src="${item.icon}" alt="" class="gigs-ico-sm" />
        </span>
      </article>`
    ).join('');
  }

  function renderLineups() {
    const strip = document.getElementById('lineupStrip');
    if (!strip) return;
    strip.innerHTML = LINEUPS.map(
      (item, idx) => `
      <article class="gigs-lineup-card gigs-card-hover gigs-reveal ${item.isCta ? 'is-cta-card gigs-spring-btn' : ''}" data-delay="${idx % 4}" style="--laser-idx: ${idx}" ${item.isCta ? 'data-screen="creator" role="button" tabindex="0"' : ''}>
        <div class="gigs-lineup-inner">
          <img src="${esc(item.photo)}" alt="" class="gigs-lineup-bg" loading="lazy" aria-hidden="true" />
          <div class="gigs-lineup-top-bar">
            <span class="gigs-lineup-slot"><i aria-hidden="true"></i>${esc(item.slot)}</span>
          </div>
          <div class="gigs-lineup-logo-stage ${item.logoMode}">
            ${
              item.logo
                ? `<img src="${esc(item.logo)}" alt="Logo ${esc(item.name)}" class="gigs-lineup-logo" loading="lazy" />`
                : item.isCta
                  ? `<div class="gigs-lineup-open-emblem"><span aria-hidden="true">+</span><small>OPEN SLOT</small></div>`
                  : `<div class="gigs-lineup-open-emblem is-name"><span aria-hidden="true">${esc(item.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2))}</span><small>LINEUP</small></div>`
            }
          </div>
          <div class="gigs-lineup-label">
            <small>${esc(item.role)}</small>
            <strong>${esc(item.name)}</strong>
            <span class="gigs-lineup-sub">${esc(item.sub)}</span>
          </div>
        </div>
      </article>`
    ).join('');
  }

  function renderOrganizers() {
    const strip = document.getElementById('organizersRosterStrip');
    const defaultFeaturedIdx = Math.max(0, ORGANIZERS.findIndex((org) => org.featured));
    if (strip) {
      strip.innerHTML = ORGANIZERS.map(
        (org, idx) => `
        <article
          role="listitem"
          tabindex="0"
          class="gigs-org-slice gigs-reveal${idx === defaultFeaturedIdx ? ' is-active' : ''}"
          data-delay="${idx}"
          data-org-idx="${idx}"
          aria-label="${org.name} — ${org.role}"
          ${idx === defaultFeaturedIdx ? 'aria-current="true"' : ''}
        >
          <div class="gigs-org-slice-frame">
            <div class="gigs-org-slice-clip">
              <div class="gigs-org-slice-spotlight" aria-hidden="true"></div>
              <img src="${org.photo}" alt="${org.name} — ${org.role}" class="gigs-org-slice-photo" loading="lazy" />
              <div class="gigs-org-slice-scrim" aria-hidden="true"></div>
            </div>
            <div class="gigs-org-slice-content">
              <strong class="gigs-org-slice-name"><span>${org.name}</span></strong>
              <small class="gigs-org-slice-role"><span>${org.role}</span></small>
            </div>
            <span class="gigs-org-role-badge" aria-hidden="true">
              <img src="${org.icon}" alt="" />
            </span>
          </div>
        </article>`
      ).join('');
    }

    const rangkaianGrid = document.getElementById('organizersRangkaianGrid');
    if (rangkaianGrid) {
      rangkaianGrid.innerHTML = RANGKAIAN_ACARA.map(
        (item, idx) => `
        <article class="gigs-rangkaian-card gigs-card-hover gigs-reveal" data-delay="${idx % 5}">
          <span class="gigs-rangkaian-top-glow" aria-hidden="true"></span>
          <div class="gigs-rangkaian-ico-wrap">
            <img src="${item.icon}" alt="" class="gigs-rangkaian-ico${item.id === 'live-acoustic' ? ' is-acoustic' : ''}" aria-hidden="true" />
          </div>
          <strong class="gigs-rangkaian-title">
            <span>${item.line1}</span>
            <span>${item.line2}</span>
          </strong>
        </article>`
      ).join('');
    }

    const showcase = document.getElementById('organizers');
    if (showcase && !showcase.dataset.orgBound) {
      showcase.dataset.orgBound = '1';
      const setActiveSlice = (activeIdx) => {
        const slices = strip?.querySelectorAll('.gigs-org-slice');
        slices?.forEach((slice) => {
          const match = Number(slice.dataset.orgIdx) === activeIdx;
          slice.classList.toggle('is-active', match);
          if (match) slice.setAttribute('aria-current', 'true');
          else slice.removeAttribute('aria-current');
        });
      };

      strip?.addEventListener('pointerover', (e) => {
        const slice = e.target.closest('.gigs-org-slice');
        if (slice) setActiveSlice(Number(slice.dataset.orgIdx));
      });
      strip?.addEventListener('focusin', (e) => {
        const slice = e.target.closest('.gigs-org-slice');
        if (slice) setActiveSlice(Number(slice.dataset.orgIdx));
      });
      strip?.addEventListener('click', (e) => {
        const slice = e.target.closest('.gigs-org-slice');
        if (slice) setActiveSlice(Number(slice.dataset.orgIdx));
      });
      strip?.addEventListener('keydown', (e) => {
        const slice = e.target.closest('.gigs-org-slice');
        if (!slice) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setActiveSlice(Number(slice.dataset.orgIdx));
        }
      });
      strip?.addEventListener('pointerleave', () => {
        setActiveSlice(defaultFeaturedIdx);
      });

      showcase.addEventListener('pointermove', (e) => {
        if (!isMotionEnabled()) return;
        const card = e.target.closest('.gigs-rangkaian-card');
        if (!card) return;
        const rect = card.getBoundingClientRect();
        if (!rect.width) return;
        const xPct = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
        card.style.setProperty('--glow-x', `${xPct.toFixed(1)}%`);
      });

      showcase.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('[data-org-tab]');
        if (tabBtn) {
          const tab = tabBtn.dataset.orgTab;
          showcase.querySelectorAll('[data-org-tab]').forEach((btn) => {
            const active = btn === tabBtn;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', String(active));
          });
          const targetId =
            tab === 'event'
              ? 'organizers-event-deck'
              : tab === 'organizer'
                ? 'organizers-roster-deck'
                : document.getElementById('organizers-rundown-deck')
                  ? 'organizers-rundown-deck'
                  : 'organizersRangkaianGrid';
          document.getElementById(targetId)?.scrollIntoView({
            behavior: isMotionEnabled() ? 'smooth' : 'auto',
            block: 'start',
          });
          return;
        }

        const conceptBtn = e.target.closest('[data-open-concept-video]');
        if (conceptBtn) {
          openMediaPreview(3, conceptBtn);
        }
      });
    }
  }

  function renderMediaHighlights() {
    const grid = document.getElementById('mediaGrid');
    if (!grid) return;
    grid.innerHTML = MEDIA_HIGHLIGHTS.map(
      (m, idx) => `
      <button
        type="button"
        class="gigs-media-card ${m.featured ? 'is-featured' : ''} gigs-card-hover gigs-reveal"
        data-delay="${idx % 3}"
        data-media-idx="${idx}"
        aria-label="Putar pratinjau ${m.title} (${m.duration})"
      >
        <img src="${m.photo}" alt="${m.title}" class="gigs-media-thumb" loading="lazy" />
        <div class="gigs-media-scrim" aria-hidden="true"></div>
        <div class="gigs-media-top">
          <span class="gigs-media-tag">${m.tag}</span>
          <span class="gigs-media-dur">${m.duration}</span>
        </div>
        <span class="gigs-media-play-btn" aria-hidden="true">
          <img src="/event/gigs-akhir-tahun-2026/gigs-svg/icons/play.svg" alt="" />
        </span>
        <div class="gigs-media-caption">
          <strong>${m.title}</strong>
          <small>Pratinjau Story &rarr;</small>
        </div>
      </button>`
    ).join('');
  }

  function renderCreatorSections() {
    const strip = document.getElementById('creatorStripCards');
    if (strip) {
      strip.innerHTML = CREATOR_CATEGORIES.slice(0, 5)
        .map(
          (cat) => `
        <div class="gigs-strip-cat gigs-card-hover">
          <img src="${cat.photo}" alt="" loading="lazy" />
          <span>${cat.short}</span>
          <i class="gigs-strip-arrow" aria-hidden="true"><img src="/event/gigs-akhir-tahun-2026/gigs-svg/icons/arrow-up-right.svg" alt="" /></i>
        </div>`
        )
        .join('');
    }

    const pick = document.getElementById('creatorPickGrid');
    if (pick) {
      pick.innerHTML = CREATOR_CATEGORIES.map(
        (cat) => `
        <button type="button" class="gigs-pick-cat gigs-spring-btn ${
          state.selectedCreatorCat === cat.key ? 'is-selected' : ''
        }" data-pick-cat="${cat.key}" aria-pressed="${state.selectedCreatorCat === cat.key}">
          <img src="${cat.icon}" alt="" aria-hidden="true" />
          <span>${cat.label}</span>
        </button>`
      ).join('');
    }

    renderCommunityGrid();
  }

  function getSavedCreators() {
    try {
      const raw = localStorage.getItem('gigs2026_creator_drafts');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Data publik dari pendaftaran mandiri yang sudah disetujui panitia (lihat /api/public/participants).
  let publicParticipants = { sponsors: [], creators: [] };
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
  const SPONSOR_CATEGORY_LABEL = {
    kuliner: 'Kuliner & Kopi', fashion: 'Fashion & Merch', 'jasa-kreatif': 'Jasa Kreatif', teknologi: 'Gaming & Teknologi', komunitas: 'Komunitas', lainnya: 'UMKM Lokal',
  };

  function renderCommunityGrid() {
    const grid = document.getElementById('communityGrid');
    if (!grid) return;
    const approved = publicParticipants.creators.map((item) => ({
      name: item.name.toUpperCase(),
      cat: item.category,
      tag: 'Kreator terdaftar',
      photo: item.logo || CREATOR_CATEGORIES.find((c) => c.key === item.category)?.photo || '/event/gigs-akhir-tahun-2026/photos/lineup-1.jpg',
    }));
    const saved = getSavedCreators().map((item) => ({
      name: item.name.toUpperCase(),
      cat: item.cat || 'band',
      tag: 'Tersimpan di perangkat ini',
      photo: CREATOR_CATEGORIES.find((c) => c.key === item.cat)?.photo || '/event/gigs-akhir-tahun-2026/photos/lineup-1.jpg',
    }));
    void saved; // draf lokal lama tidak lagi ditampilkan; hanya data yang disetujui panitia
    const allMembers = [...approved, ...COMMUNITY_MEMBERS];
    const filtered = allMembers.filter(
      (m) => state.communityFilter === 'all' || m.cat === state.communityFilter
    );
    grid.innerHTML = filtered
      .map(
        (m) => `
      <article class="gigs-comm-card gigs-card-hover">
        <img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" />
        <div class="gigs-comm-card-body">
          <strong>${esc(m.name)}</strong>
          <span>${esc(m.tag)}</span>
        </div>
      </article>`
      )
      .join('');
  }

  let ledgerSummary;

  // ---- Pusat Pengaturan (dari /api/public/config) ----
  const EVENT_CONFIG = { target: 17000000, sponsorMin: 300000, dateMs: Date.parse('2026-12-31T19:00:00+07:00'), notes: null };
  const rabTotal = () => RAB_ITEMS.reduce((t, item) => t + item.budget, 0);

  function applyConfigBindings() {
    const total = rabTotal();
    const gap = EVENT_CONFIG.target - total;
    const values = {
      target: FORMAT_IDR(EVENT_CONFIG.target),
      rabTotal: FORMAT_IDR(total),
      rabGap: gap >= 0 ? FORMAT_IDR(gap) : `−${FORMAT_IDR(-gap)}`,
      rabCount: String(RAB_ITEMS.length),
    };
    document.querySelectorAll('[data-cfg]').forEach((node) => {
      if (values[node.dataset.cfg] !== undefined) node.textContent = values[node.dataset.cfg];
    });
    const notes = document.getElementById('rabNotesList');
    if (notes && EVENT_CONFIG.notes) {
      notes.replaceChildren(...EVENT_CONFIG.notes.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }));
    }
  }

  async function loadPublicConfig() {
    try {
      const config = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/config', { credentials: 'same-origin' })).json();
      if (config?.finance?.budgetLines?.length) {
        const previous = new Map(RAB_ITEMS.map((item) => [item.no, item]));
        RAB_ITEMS = config.finance.budgetLines.map((line) => ({
          no: line.code, pos: line.name, shortPos: line.name, budget: line.budget, purpose: line.purpose || '',
          status: previous.get(line.code)?.status || 'Belum Realisasi', badge: previous.get(line.code)?.badge || 'draft',
        }));
        EVENT_CONFIG.target = config.finance.target;
        EVENT_CONFIG.notes = config.finance.notes || null;
      }
      if (config?.sponsorMin) EVENT_CONFIG.sponsorMin = config.sponsorMin;
      const dateMs = Date.parse(config?.event?.date || '');
      if (Number.isFinite(dateMs)) EVENT_CONFIG.dateMs = dateMs;
      applyConfigBindings();
      renderFinanceData();
    } catch {
      applyConfigBindings();
    }
    loadPublicLineup();
    loadPublicChanges();
    loadPublicReadiness();
    loadPublicLive();
    loadPublicCloseout();
    // Banner "Sedang tampil" diperbarui tiap 30 detik selama halaman terlihat.
    setInterval(() => { if (!document.hidden) loadPublicLive(); }, 30000);
  }

  // Hari H: banner "Sedang tampil" (nama penampil hanya bila profilnya tayang).
  async function loadPublicLive() {
    try {
      const data = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/live', { credentials: 'same-origin' })).json();
      const banner = document.getElementById('liveBanner');
      if (!banner) return;
      banner.hidden = !data?.current;
      if (!data?.current) return;
      const label = (r) => `${r.name}${r.performer ? ` · ${r.performer}` : ''}`;
      document.getElementById('liveBannerNow').textContent = `${label(data.current)}${data.since ? ` (sejak ${data.since} WIB)` : ''}`;
      document.getElementById('liveBannerNext').textContent = data.next ? `Berikutnya: ${label(data.next)}${data.next.startTime ? ` · ${data.next.startTime} WIB` : ''}` : '';
    } catch {}
  }

  // Laporan akhir (Blueprint bab 30) di Transparansi — hanya setelah dipublikasikan panitia.
  async function loadPublicCloseout() {
    try {
      const { closeout: c } = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/closeout', { credentials: 'same-origin' })).json();
      const box = document.getElementById('pubCloseout');
      if (!box || !c) return;
      box.hidden = false;
      const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };
      set('pubCloseoutMeta', `${c.event.name} · ${c.event.venue} · dipublikasikan ${new Date(c.publishedAt.replace(' ', 'T') + 'Z').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}`);
      const tiles = document.getElementById('pubCloseoutTiles');
      tiles.replaceChildren(...[
        ['Dana masuk sah', FORMAT_IDR(c.finance.income), `Target ${FORMAT_IDR(c.finance.target)}`],
        ['Pengeluaran sah', FORMAT_IDR(c.finance.expense), `${c.finance.corrections} koreksi tercatat`],
        ['Saldo akhir', FORMAT_IDR(c.finance.balance), c.finance.pendingPayments ? `Masih ada pembayaran tertunda ${FORMAT_IDR(c.finance.pendingPayments)}` : 'Tidak ada pembayaran tertunda'],
        ['Penonton (perkiraan)', String(c.attendance), `${c.incidents.total} insiden, ${c.incidents.resolved} ditangani`],
      ].map(([label, value, sub]) => {
        const d = document.createElement('div');
        const s = document.createElement('small'); s.textContent = label;
        const v = document.createElement('strong'); v.textContent = value;
        const t = document.createElement('span'); t.textContent = sub;
        d.append(s, v, t);
        return d;
      }));
      const list = document.getElementById('pubCloseoutProgram');
      list.replaceChildren(...c.program.map((p) => {
        const li = document.createElement('li');
        li.textContent = `${p.actualStart ? `${p.actualStart}${p.actualEnd ? `–${p.actualEnd}` : ''}` : 'tidak tercatat'} · ${p.name}${p.performer ? ` · ${p.performer}` : ''}`;
        return li;
      }));
      set('pubCloseoutSponsors', c.sponsors.length ? c.sponsors.map((s) => s.name + (s.support === 'nonkas' ? ' (barang/jasa)' : '')).join(', ') : '-');
      const totalB = c.benefits.hak.total + c.benefits.konten.total;
      set('pubCloseoutBenefits', totalB ? `${c.benefits.hak.done + c.benefits.konten.done}/${totalB} hak selesai untuk ${c.benefits.sponsors} sponsor` : '-');
      set('pubCloseoutEval', c.evaluation || '-');
      set('pubCloseoutRec', c.recommendations || '-');
      set('pubCloseoutSurplus', c.surplusDecision || '-');
    } catch {}
  }

  // Kesiapan event: cincin % beranimasi di beranda & Transparansi (data publik tanpa nama/rincian privat).
  async function loadPublicReadiness() {
    try {
      const data = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/readiness', { credentials: 'same-origin' })).json();
      if (typeof data?.total !== 'number') return;
      const label = `${String(data.total).replace('.', ',')}%`;
      document.querySelectorAll('[data-ready-total]').forEach((node) => {
        const ring = node.closest('.gigs-ready-ring');
        node.textContent = '0%';
        if (ring) ring.style.setProperty('--p', '0');
        // Animasi naik bertahap (dilewati bila pengguna memilih gerak dikurangi).
        const finish = () => { node.textContent = label; ring?.style.setProperty('--p', String(data.total)); ring?.setAttribute('aria-label', `Kesiapan ${label}`); };
        if (!isMotionEnabled() || document.hidden) { finish(); return; }
        const start = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - start) / 1200);
          const v = data.total * (1 - Math.pow(1 - p, 3));
          node.textContent = `${Math.round(v)}%`;
          ring?.style.setProperty('--p', String(v));
          if (p < 1) requestAnimationFrame(step); else finish();
        };
        requestAnimationFrame(step);
        setTimeout(finish, 1500);
      });
      const home = document.getElementById('homeReady');
      if (home) home.hidden = false;
      const pub = document.getElementById('pubReady');
      if (pub) pub.hidden = false;
      const comps = document.getElementById('pubReadyComps');
      if (comps) {
        comps.replaceChildren(...data.components.filter((c) => c.weight > 0).map((c) => {
          const row = document.createElement('div');
          row.className = `gigs-ready-comp${c.available ? '' : ' is-off'}`;
          const head = document.createElement('div');
          head.className = 'gigs-ready-comp-head';
          const name = document.createElement('strong');
          name.textContent = c.label;
          const val = document.createElement('span');
          val.textContent = c.available ? `${c.percent}%` : 'menyusul';
          head.append(name, val);
          const bar = document.createElement('div');
          bar.className = 'gigs-ready-bar';
          const fill = document.createElement('span');
          fill.style.width = `${c.available ? c.percent : 0}%`;
          bar.append(fill);
          row.append(head, bar);
          return row;
        }));
      }
      const meta = document.getElementById('pubReadyMeta');
      if (meta) {
        const GATE = { A: 'Kelayakan venue & izin', B: 'Komitmen finansial', C: 'Siap tampil' };
        const DEC = { go: 'Keputusan: GO', nogo: 'Keputusan: NO GO', tunda: 'Keputusan: TUNDA' };
        const chips = data.gates.map((g) => {
          const span = document.createElement('span');
          span.textContent = `Gate ${g.gate} · ${GATE[g.gate]} ${g.done}/${g.total}`;
          return span;
        });
        if (data.decision) {
          const span = document.createElement('span');
          span.className = `is-${data.decision.decision}`;
          span.textContent = DEC[data.decision.decision] || data.decision.decision;
          chips.push(span);
        }
        meta.replaceChildren(...chips);
      }
    } catch {}
  }

  // Lineup dari slot panggung. Bila panitia belum mengisi slot, lineup bawaan tetap tampil.
  async function loadPublicLineup() {
    try {
      const { slots } = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/lineup', { credentials: 'same-origin' })).json();
      const filled = (slots || []).filter((slot) => slot.performer);
      if (!filled.length) return;
      LINEUPS.splice(0, LINEUPS.length,
        ...filled.map((slot, i) => ({
          slot: slot.startTime ? `${slot.startTime} WIB` : `SLOT // ${String(i + 1).padStart(2, '0')}`,
          name: slot.performer.toUpperCase(),
          role: slot.name.toUpperCase(),
          sub: slot.durationMin ? `${slot.durationMin} menit` : '',
          photo: `/event/gigs-akhir-tahun-2026/photos/lineup-${(i % 5) + 1}.jpg`,
          logo: slot.logo,
          logoMode: 'is-logo-light',
        })),
        { slot: 'SLOT // OPEN', name: 'NEXT TALENT?', role: 'OPEN SUBMISSION', sub: 'Daftar Gratis Sekarang →', photo: '/event/gigs-akhir-tahun-2026/photos/lineup-5.jpg', logo: '', logoMode: 'is-open-slot', isCta: true });
      renderLineups();
    } catch {}
  }

  // Panel "Riwayat Perubahan & Audit Log" di Transparansi: perubahan Target & RAB terbaru di atas.
  async function loadPublicChanges() {
    try {
      const { changes } = await (await fetch('/event/gigs-akhir-tahun-2026/api/public/changes', { credentials: 'same-origin' })).json();
      const tbody = document.getElementById('auditRows');
      if (!tbody || !changes?.length) return;
      tbody.querySelectorAll('tr[data-live]').forEach((tr) => tr.remove());
      [...changes].reverse().forEach((change) => {
        const tr = document.createElement('tr');
        tr.dataset.live = '1';
        const cells = [
          `#${change.id}`,
          change.summary + (change.reason ? ` — ${change.reason}` : ''),
          'Penyelenggara',
          new Date(change.at.replace(' ', 'T') + 'Z').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' }),
        ];
        cells.forEach((text) => { const td = document.createElement('td'); td.textContent = text; tr.append(td); });
        tbody.prepend(tr);
      });
    } catch {}
  }

  function renderFinanceData() {
    const data = FINANCE_MODES[state.mode];
    const collected = ledgerSummary ? ledgerSummary.verified_amount : data.collected;
    const expense = ledgerSummary ? ledgerSummary.verified_expense : data.expense;
    const balance = ledgerSummary ? ledgerSummary.balance : Math.max(0, collected - expense);
    const pct = ledgerSummary
      ? Math.round((collected / EVENT_CONFIG.target) * 1000) / 10
      : data.pct;

    const badge = document.getElementById('homeDataBadge');
    if (badge) {
      badge.textContent = ledgerSummary ? 'LEDGER TERVERIFIKASI SOP V1.3' : data.label;
      badge.classList.toggle('is-sim', !ledgerSummary && data.isSim);
    }

    animateCounter(document.getElementById('homeCollectedValue'), collected, FORMAT_IDR);
    animateCounter(
      document.getElementById('homeProgressPct'),
      pct,
      (v) => (Number.isInteger(pct) ? `${Math.round(v)}%` : `${v.toFixed(1).replace('.', ',')}%`)
    );
    const homeBar = document.getElementById('homeProgressBar');
    if (homeBar) {
      homeBar.style.setProperty('--progress', String(Math.min(1, pct / 100)));
      homeBar.classList.toggle('is-zero', pct <= 0);
    }

    const statusNote = document.getElementById('homeFinanceStatusNote');
    if (statusNote) {
      statusNote.textContent = ledgerSummary
        ? `${ledgerSummary.transaction_count} transaksi terverifikasi`
        : data.isSim
          ? `Mode Simulasi (${pct}% dari target)`
          : 'Menunggu transaksi terverifikasi';
      statusNote.classList.toggle('is-sim', !ledgerSummary && data.isSim);
    }

    // Mini RAB grid on Home
    const miniGrid = document.getElementById('homeRabGrid');
    if (miniGrid) {
      miniGrid.innerHTML = RAB_ITEMS.map((item, idx) => {
        const sharePct = ((item.budget / Math.max(1, rabTotal())) * 100).toFixed(1).replace('.', ',');
        const shareRatio = (item.budget / Math.max(1, ...RAB_ITEMS.map((x) => x.budget))).toFixed(3);
        const spanFull = idx === RAB_ITEMS.length - 1 ? 'is-full-row' : '';
        return `
        <div class="gigs-rab-mini-item ${spanFull}" style="--item-share: ${shareRatio}">
          <div class="gigs-rab-mini-top">
            <span class="gigs-rab-mini-name"><em>${esc(item.no)}</em> ${esc(item.shortPos || item.pos)}</span>
            <strong class="gigs-rab-mini-val">${FORMAT_IDR(item.budget)}</strong>
          </div>
          <div class="gigs-rab-mini-meta">
            <div class="gigs-rab-mini-bar"><span style="width: ${Math.round(Number(shareRatio) * 100)}%"></span></div>
            <small>${sharePct}% RAB</small>
          </div>
        </div>`;
      }).join('');
    }

    // Home Sponsor Grid (Paket Sultan Sponsor)
    const sponsorGrid = document.getElementById('homeSponsorGrid');
    if (sponsorGrid) {
      const buildSponsorSlotCard = (sp, idx) => {
        const codeNum = String(idx + 1).padStart(2, '0');
        const nameUpper = String(sp.name || '').toUpperCase();
        const isHost = nameUpper === 'GARAGE COFFEE';
        const isJoin = nameUpper.includes('JADI SPONSOR');
        const isOpenSlot = sp.sub === 'NEED_OFFICIAL_LOGO' || (!sp.verified && nameUpper.startsWith('SLOT UMKM'));

        if (isHost) {
          return `
        <article role="listitem" class="gigs-sp-slot is-featured-host gigs-card-hover" data-screen="sponsor" tabindex="0" aria-label="Garage Coffee — Tuan Rumah Venue Terverifikasi">
          <svg class="gigs-sp-laser-svg" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true">
            <rect class="gigs-sp-laser-track" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
            <rect class="gigs-sp-laser-glow" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
            <rect class="gigs-sp-laser-core" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
            <rect class="gigs-sp-laser-glow is-alt" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
            <rect class="gigs-sp-laser-core is-alt" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
          </svg>
          <div class="gigs-sp-slot-top">
            <span class="gigs-sp-slot-code">HOST // ${codeNum}</span>
            <span class="gigs-sp-status-pill is-verified"><i aria-hidden="true"></i>VERIFIED</span>
          </div>
          <div class="gigs-sp-slot-main">
            <div class="gigs-sp-emblem is-host"><img src="/event/gigs-akhir-tahun-2026/gigs-svg/icons/pin.svg" alt="" aria-hidden="true" /></div>
            <div class="gigs-sp-slot-copy">
              <strong>${esc(sp.name)}</strong>
              <small>${esc(sp.sub || 'Tuan Rumah Venue')}</small>
            </div>
          </div>
          <span class="gigs-sp-slot-foot">Official Venue Host</span>
        </article>`;
        }

        if (isJoin) {
          return `
        <button type="button" role="listitem" class="gigs-sp-slot is-join-slot gigs-card-hover" data-screen="sponsor" aria-label="Jadi Sponsor — Manfaat Setara">
          <svg class="gigs-sp-laser-svg is-single" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true">
            <rect class="gigs-sp-laser-track" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
            <rect class="gigs-sp-laser-glow" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
            <rect class="gigs-sp-laser-core" x="1.5" y="1.5" width="197" height="137" rx="12" ry="12" pathLength="1000" />
          </svg>
          <span class="gigs-sp-corner is-tl" aria-hidden="true"></span>
          <span class="gigs-sp-corner is-br" aria-hidden="true"></span>
          <div class="gigs-sp-slot-top">
            <span class="gigs-sp-slot-code">JOIN // ${codeNum}</span>
            <span class="gigs-sp-status-pill is-highlight">SETARA</span>
          </div>
          <div class="gigs-sp-slot-main">
            <div class="gigs-sp-emblem is-join" aria-hidden="true"><span>+</span></div>
            <div class="gigs-sp-slot-copy">
              <strong>${esc(sp.name)}</strong>
              <small>${esc(sp.sub || 'Manfaat Setara')}</small>
            </div>
          </div>
          <span class="gigs-sp-slot-foot">Mulai ${esc(FORMAT_IDR(EVENT_CONFIG.sponsorMin))} &rarr;</span>
        </button>`;
        }

        if (isOpenSlot) {
          return `
        <button type="button" role="listitem" class="gigs-sp-slot is-open-slot gigs-card-hover" data-screen="sponsor" data-slot-status="NEED_OFFICIAL_LOGO" style="--scan-delay: ${(idx * 0.45).toFixed(2)}s" aria-label="${esc(sp.name)} — Slot Partner Terbuka, Klik untuk daftar sponsor">
          <span class="gigs-sp-scanner-beam" aria-hidden="true"></span>
          <span class="gigs-sp-corner is-tl" aria-hidden="true"></span>
          <span class="gigs-sp-corner is-br" aria-hidden="true"></span>
          <div class="gigs-sp-slot-top">
            <span class="gigs-sp-slot-code">UMKM // ${codeNum}</span>
            <span class="gigs-sp-status-pill is-open">OPEN SLOT</span>
          </div>
          <div class="gigs-sp-slot-main">
            <div class="gigs-sp-emblem is-open" aria-hidden="true"><span>+</span></div>
            <div class="gigs-sp-slot-copy">
              <strong>${esc(sp.name)}</strong>
              <small>Slot Partner Terbuka</small>
            </div>
          </div>
          <span class="gigs-sp-slot-foot">Klaim Slot &rarr;</span>
        </button>`;
        }

        const pillCls = sp.verified ? 'is-verified' : 'is-sim';
        const pillText = sp.verified ? (state.mode === 'verified' ? 'VERIFIED' : 'SIMULASI') : 'PENDING';
        return `
        <article role="listitem" class="gigs-sp-slot is-partner-slot gigs-card-hover" data-screen="sponsor" tabindex="0" aria-label="${esc(sp.name)} — ${esc(sp.sub)}">
          <div class="gigs-sp-slot-top">
            <span class="gigs-sp-slot-code">PARTNER // ${codeNum}</span>
            <span class="gigs-sp-status-pill ${pillCls}"><i aria-hidden="true"></i>${pillText}</span>
          </div>
          <div class="gigs-sp-slot-main">
            ${
              sp.logo
                ? `<div class="gigs-sp-logo-box"><img src="${esc(sp.logo)}" alt="Logo ${esc(sp.name)}" class="gigs-sp-slot-logo" loading="lazy" /></div>`
                : `<div class="gigs-sp-emblem is-partner"><img src="/event/gigs-akhir-tahun-2026/gigs-svg/icons/handshake.svg" alt="" aria-hidden="true" /></div>`
            }
            <div class="gigs-sp-slot-copy">
              <strong>${esc(sp.name)}</strong>
              <small>${esc(sp.sub)}</small>
            </div>
          </div>
          <span class="gigs-sp-slot-foot">Manfaat Setara</span>
        </article>`;
      };

      if (state.mode === 'verified' && publicParticipants.sponsors.length) {
        const host = data.sponsors.find((sp) => sp.name === 'GARAGE COFFEE');
        const entries = [
          ...(host ? [host] : []),
          ...publicParticipants.sponsors.map((sp) => ({
            name: sp.name,
            sub: sp.support === 'nonkas' ? ('Dukungan barang/jasa' + (sp.supportNote ? ' · ' + sp.supportNote : '')) : (SPONSOR_CATEGORY_LABEL[sp.category] || 'Sponsor UMKM'),
            verified: true,
            logo: sp.logo,
          })),
          { name: '+ JADI SPONSOR', sub: 'Manfaat Setara', verified: false },
        ];
        sponsorGrid.innerHTML = entries.map((sp, idx) => buildSponsorSlotCard(sp, idx)).join('');
      } else {
        sponsorGrid.innerHTML = data.sponsors.map((sp, idx) => buildSponsorSlotCard(sp, idx)).join('');
      }
    }

    // Transparansi Screen KPIs
    animateCounter(document.getElementById('trVerifiedValue'), collected, FORMAT_IDR);
    animateCounter(document.getElementById('trExpenseValue'), expense, FORMAT_IDR);
    animateCounter(document.getElementById('trBalanceValue'), balance, FORMAT_IDR);
    const trPct = document.getElementById('trVerifiedPct');
    if (trPct) trPct.textContent = `${String(pct).replace('.', ',')}% dari target`;
    const trBar = document.getElementById('trProgressBar');
    if (trBar) trBar.style.setProperty('--progress', String(Math.min(1, pct / 100)));
    const trBadge = document.getElementById('trUpdateBadge');
    if (trBadge) {
      trBadge.textContent = ledgerSummary
        ? `${ledgerSummary.transaction_count} penerimaan sponsor terverifikasi`
        : data.isSim
          ? data.updateText
          : 'Update: Belum ada transaksi';
    }

    // Alur dana (Blueprint V1.3: pisahkan komitmen, dana masuk, dan pengeluaran aktual)
    const TARGET = EVENT_CONFIG.target;
    const flowSet = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = FORMAT_IDR(value); };
    flowSet('flowTarget', TARGET);
    flowSet('flowIn', collected);
    flowSet('flowOut', expense);
    flowSet('flowBalance', balance);
    flowSet('flowCommitted', ledgerSummary?.committed_amount || 0);
    flowSet('flowNeed', Math.max(0, TARGET - collected));
    const flowCommittedNote = document.getElementById('flowCommittedNote');
    if (flowCommittedNote) flowCommittedNote.textContent = `${ledgerSummary?.committed_count || 0} sponsor terdaftar, dana belum disahkan`;
    const over = document.getElementById('flowOver');
    if (over) {
      over.hidden = collected <= TARGET;
      over.textContent = collected > TARGET ? `Kelebihan di atas target: ${FORMAT_IDR(collected - TARGET)} (dicatat terpisah, tidak masuk pos RAB).` : '';
    }

    // RAB Table on Transparansi (matches 06_Transparansi_Dana.png with Rp0 default realisasi)
    const tbody = document.getElementById('transRabBody');
    let sumRealisasi = 0;
    let sumSisa = 0;
    if (tbody) {
      tbody.innerHTML = RAB_ITEMS.map((item, idx) => {
        const realisasi = ledgerSummary
          ? ledgerSummary.expenses.find((entry) => entry.budget_code === item.no)?.amount || 0
          : data.realisasi[idx] || 0;
        const sisa = item.budget - realisasi;
        sumRealisasi += realisasi;
        sumSisa += sisa;
        const badgeCls = item.badge === 'warning' ? 'gigs-badge-warning' : 'gigs-badge-draft';
        // 3 lapis: anggaran (latar) → dipesan/kontrak (kuning) → dibayar sah (merah). Tahap dari kontrak vendor.
        const status = ledgerSummary?.budget_status?.find((b) => b.code === item.no);
        const pct = (v) => Math.min(100, Math.round((v / Math.max(1, item.budget)) * 100));
        const usedPct = pct(realisasi);
        const orderedPct = pct(status?.contracted || 0);
        const STAGE_LABEL = {
          'belum-dipesan': 'Belum dipesan', dipesan: 'Vendor dipesan', dp: 'DP dibayar', lunas: 'Lunas', selesai: 'Selesai ✓',
          'tanpa-vendor': 'Tanpa vendor', terpakai: 'Terpakai',
        };
        const stageText = status ? STAGE_LABEL[status.stage] || status.stage : '';
        const vendorText = status?.vendors?.length ? ` · ${status.vendors.join(', ')}` : '';
        const stageBadge = status && status.stage !== 'belum-dipesan' && status.stage !== 'tanpa-vendor'
          ? (['lunas', 'selesai'].includes(status.stage) ? 'gigs-badge-verified' : 'gigs-badge-warning') : badgeCls;
        return `
          <tr>
            <td data-label="No.">${esc(item.no)}</td>
            <td data-label="Pos Anggaran"><strong>${esc(item.pos)}</strong><small class="gigs-rab-purpose">${esc(item.purpose)}</small>
              <span class="gigs-rab-use" role="img" aria-label="Dipesan ${orderedPct}%, dibayar ${usedPct}% dari anggaran"><span class="is-ordered" style="width:${orderedPct}%"></span><span class="is-paid" style="width:${usedPct}%"></span></span>
              ${status?.contracted ? `<small class="gigs-rab-stage">Dipesan ${FORMAT_IDR(status.contracted)}${esc(vendorText)}</small>` : ''}</td>
            <td data-label="Anggaran">${FORMAT_IDR(item.budget)}</td>
            <td data-label="Realisasi">${FORMAT_IDR(realisasi)}</td>
            <td data-label="Sisa">${FORMAT_IDR(sisa)}</td>
            <td data-label="Status"><span class="gigs-badge ${sisa < 0 ? 'gigs-badge-warning' : stageBadge}">${
              sisa < 0 ? 'Melebihi anggaran' : esc(stageText || (ledgerSummary && realisasi ? 'Realisasi tercatat' : item.status))
            }</span></td>
          </tr>`;
      }).join('');
    }
    const totR = document.getElementById('transTotalRealisasi');
    const totS = document.getElementById('transTotalSisa');
    if (totR) totR.textContent = FORMAT_IDR(sumRealisasi);
    if (totS) totS.textContent = FORMAT_IDR(sumSisa);

    // Organizer Screen KPIs & Sidebar Badges
    animateCounter(document.getElementById('orgSponsorCount'), data.sponsorCount, (v) => String(Math.round(v)));
    const orgSub = document.getElementById('orgSponsorSub');
    if (orgSub) orgSub.textContent = `${data.sponsorPending} menunggu verifikasi`;
    animateCounter(document.getElementById('orgDanaValue'), collected, FORMAT_IDR);

    const trSideBadge = document.querySelector('#screen-transparansi .gigs-side-nav .gigs-side-badge');
    if (trSideBadge) {
      trSideBadge.textContent =
        collected > 0
          ? `RP${(collected / 1000000).toFixed(1).replace('.0', '').replace('.', ',')}JT`
          : 'RP0';
    }
    const orgSideBadge = document.querySelector('#orgSideNav .gigs-side-badge');
    if (orgSideBadge) {
      const pendingCount = ledgerSummary
        ? (ledgerSummary.pending_sponsors || 0) + 1
        : (data.sponsorPending || 0) + 1;
      orgSideBadge.textContent = String(pendingCount);
    }
  }

  function renderSvgGallery() {
    const grid = document.getElementById('svgGalleryGrid');
    if (!grid) return;
    const query = state.svgSearch.trim().toLowerCase();
    const tiles = [];

    Object.entries(SVG_INVENTORY).forEach(([cat, files]) => {
      if (state.svgCategory !== 'all' && state.svgCategory !== cat) return;
      files.forEach((name) => {
        if (query && !name.toLowerCase().includes(query) && !cat.includes(query)) return;
        tiles.push({ cat, name, src: `/event/gigs-akhir-tahun-2026/gigs-svg/${cat}/${name}.svg` });
      });
    });

    grid.innerHTML = tiles
      .map(
        (t) => `
      <div class="gigs-svg-tile gigs-card-hover">
        <div class="gigs-svg-thumb"><img src="${t.src}" alt="${t.name}" loading="lazy" /></div>
        <strong>${t.name}.svg</strong>
        <span>${t.cat}</span>
      </div>`
      )
      .join('');
  }

  function renderModalTab(tabName) {
    state.modalTab = tabName;
    document.querySelectorAll('.gigs-modal-tabs button').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mtab === tabName);
    });
    const body = document.getElementById('modalTabBody');
    if (!body) return;

    if (tabName === 'login') {
      // Info Portal: satu tampilan sederhana. Hanya penyelenggara yang login.
      body.innerHTML = `
        <div class="gigs-modal-stack gigs-info-portal">
          <p class="gigs-empty-sub">Sponsor, kreator, dan crew <strong>tidak perlu akun</strong> — cukup daftar mandiri.</p>
          <a href="/event/gigs-akhir-tahun-2026/daftar" class="gigs-btn-primary gigs-info-main">
            <span><strong>Daftar Mandiri</strong><small>Sponsor Rp300rb–Rp20jt &middot; Kreator/Talent &middot; Crew</small></span><span aria-hidden="true">&rarr;</span>
          </a>
          <a href="/event/gigs-akhir-tahun-2026/daftar#cek" class="gigs-btn-outline">
            <span><strong>Cek status pendaftaran</strong><small>Masukkan ID &amp; kode edit Anda</small></span><span aria-hidden="true">&rarr;</span>
          </a>
          <button type="button" class="gigs-btn-outline" id="modalGoTransparansi">
            <span><strong>Lihat Transparansi Dana &amp; RAB</strong><small>Uang masuk dari mana, dipakai untuk apa</small></span><span aria-hidden="true">&rarr;</span>
          </button>
          <div class="gigs-info-staff">
            <span>Khusus panitia</span>
            <a href="/event/gigs-akhir-tahun-2026/penyelenggara" class="gigs-btn-outline gigs-btn-sm">Masuk Penyelenggara</a>
          </div>
        </div>`;
      document.getElementById('modalGoTransparansi')?.addEventListener('click', () => {
        closeModal();
        navigateToScreen('transparansi');
      });
    } else if (tabName === 'step') {
      body.innerHTML = `
        <div class="gigs-modal-stack">
          <strong>Alur Pendaftaran Sponsor UMKM (Setara)</strong>
          <p class="gigs-empty-sub">1. Isi Daftar Mandiri (profil, logo, nominal).<br/>2. Panitia meninjau &amp; mengirim rekening resmi via WhatsApp.<br/>3. Dana dicatat satu panitia dan disahkan panitia lain sesuai SOP V1.3.</p>
          <button type="button" class="gigs-btn-primary gigs-spring-btn" id="modalGoSponsor">Buka Sponsor Portal &rarr;</button>
        </div>`;
      document.getElementById('modalGoSponsor')?.addEventListener('click', () => {
        closeModal();
        navigateToScreen('sponsor');
      });
    } else if (tabName === 'confirm') {
      body.innerHTML = `
        <div class="gigs-modal-stack">
          <strong>Verifikasi Bukti Transfer 2 Pihak</strong>
          <p class="gigs-empty-sub">Setiap transfer dicatat dari mutasi bank oleh satu panitia lalu disahkan panitia lain sebelum tampil sebagai dana terverifikasi.</p>
          <a href="/event/gigs-akhir-tahun-2026/daftar" class="gigs-btn-outline">Daftar Mandiri &rarr;</a>
        </div>`;
    } else {
      body.innerHTML = `
        <div class="gigs-modal-stack">
          <strong>Status Pengajuan Sponsor &amp; Kreator</strong>
          <p class="gigs-empty-sub">Cek status pendaftaran di <a href="/event/gigs-akhir-tahun-2026/daftar#cek">Daftar Mandiri</a> dengan ID &amp; kode edit Anda.</p>
        </div>`;
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isQaPreview = urlParams.get('qa') === '1' || urlParams.has('mode');
  const publicScreens = new Set(['home', 'sponsor', 'creator', 'transparansi', 'system', 'organizer']);

  function switchScreen(screenId, scrollSelector) {
    state.screen = screenId;
    document.querySelectorAll('.gigs-screen').forEach((sec) => {
      const match = sec.id === `screen-${screenId}`;
      sec.hidden = !match;
      sec.classList.toggle('is-active', match);
    });
    document.querySelectorAll('[data-screen]').forEach((btn) => {
      const matchesScreen = btn.dataset.screen === screenId;
      const matchesScroll = scrollSelector ? btn.dataset.scroll === scrollSelector : !btn.dataset.scroll;
      btn.classList.toggle('is-active', matchesScreen && matchesScroll);
    });
    syncNavIndicator();
    setupRevealObserver();
    revealActiveScreenImmediate();
    if (scrollSelector) {
      const target = document.querySelector(scrollSelector);
      if (target) target.scrollIntoView({ behavior: isMotionEnabled() ? 'smooth' : 'auto' });
    } else {
      window.scrollTo({ top: 0, behavior: isMotionEnabled() ? 'smooth' : 'auto' });
    }
  }

  function navigateToScreen(screenId, scrollSelector) {
    if (publicScreens.has(screenId) && !urlParams.get('qa')) {
      // GIGS_BASE: sub-path di GARAGE EVENT PLATFORM (mis. /event/gigs-akhir-tahun-2026); kosong di laptop.
      const base = window.GIGS_BASE || '';
      const pathname = base + (screenId === 'home' ? '/' : ['sponsor', 'creator', 'transparansi'].includes(screenId) ? `/${screenId}` : `/#${screenId}`);
      const destination = pathname + (scrollSelector || '');
      if (destination !== window.location.pathname + window.location.hash) {
        window.history.pushState(null, '', destination);
      }
    }
    switchScreen(screenId, scrollSelector);
  }

  let modalTrigger;

  function openModal(tabName = 'login', trigger = document.activeElement) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    const titleEl = document.getElementById('authModalTitle');
    const tabsEl = modal.querySelector('.gigs-modal-tabs');
    if (titleEl) titleEl.textContent = 'Info Portal GIGS 2026';
    if (tabsEl) tabsEl.hidden = false;
    modal.hidden = false;
    modalTrigger = trigger;
    renderModalTab(tabName);
    modal.querySelector('button[data-close-modal]')?.focus();
  }

  function openMediaPreview(index, trigger = document.activeElement) {
    const item = MEDIA_HIGHLIGHTS[Number(index)];
    const modal = document.getElementById('authModal');
    const body = document.getElementById('modalTabBody');
    if (!item || !modal || !body) return;
    const titleEl = document.getElementById('authModalTitle');
    const tabsEl = modal.querySelector('.gigs-modal-tabs');
    if (titleEl) titleEl.textContent = `${item.tag} — ${item.title}`;
    if (tabsEl) tabsEl.hidden = true;
    modal.hidden = false;
    modalTrigger = trigger;
    body.innerHTML = `
      <div class="gigs-media-modal">
        <div class="gigs-media-modal-frame">
          <img src="${item.photo}" alt="${item.title}" />
          <span class="gigs-media-modal-pill">${item.tag} &middot; ${item.duration}</span>
        </div>
        <p class="gigs-media-modal-desc">${item.desc}</p>
        <div class="gigs-media-modal-actions">
          <a href="https://www.instagram.com/garagecoffee/" target="_blank" rel="noopener noreferrer" class="gigs-btn-primary gigs-spring-btn">
            <span>Buka Instagram @garagecoffee</span>
            <img src="/event/gigs-akhir-tahun-2026/gigs-svg/icons/external.svg" alt="" class="gigs-ico" aria-hidden="true" />
          </a>
          <button type="button" class="gigs-btn-outline gigs-spring-btn" data-media-creator>
            <span>Portal Dokumentasi &amp; Kreator &rarr;</span>
          </button>
        </div>
      </div>`;
    body.querySelector('[data-media-creator]')?.addEventListener('click', () => {
      closeModal();
      navigateToScreen('creator');
    });
    modal.querySelector('button[data-close-modal]')?.focus();
  }

  function closeModal() {
    const modal = document.getElementById('authModal');
    if (modal?.hidden === false) {
      modal.hidden = true;
      modalTrigger?.focus();
    }
  }

  const sidebarSpyLockUntil = new WeakMap();

  function setActiveSidebarButton(nav, activeBtn, lockMs = 0) {
    if (!nav || !activeBtn) return;
    nav.querySelectorAll('button').forEach((btn) => {
      const isMatch = btn === activeBtn;
      btn.classList.toggle('is-active', isMatch);
      if (isMatch) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    if (lockMs > 0) sidebarSpyLockUntil.set(nav, Date.now() + lockMs);
  }

  // Interactive Sponsor Portal Live Preview + MVP Submission Flow
  function setupSponsorPortal() {
    const form = document.getElementById('sponsorForm');
    const nameEl = document.getElementById('spName');
    const catEl = document.getElementById('spCategory');
    const picEl = document.getElementById('spPic');
    const waEl = document.getElementById('spWa');
    const igEl = document.getElementById('spIg');
    const descEl = document.getElementById('spDesc');
    const pillsEl = document.getElementById('spAmountPills');
    const logoInput = document.getElementById('spLogoInput');
    const photoInput = document.getElementById('spPhotoInput');

    const syncPreview = () => {
      const pName = document.getElementById('previewSpName');
      const pCat = document.getElementById('previewSpCat');
      const pDesc = document.getElementById('previewSpDesc');
      if (pName && nameEl) pName.textContent = (nameEl.value || 'NAMA USAHA ANDA').toUpperCase();
      if (pCat && catEl) pCat.textContent = catEl.value;
      if (pDesc && descEl) pDesc.textContent = descEl.value || 'Deskripsi singkat usaha sponsor.';
    };

    [nameEl, catEl, descEl].forEach((el) => el?.addEventListener('input', syncPreview));

    // Sidebar shortcuts: jump to the matching section of this page.
    const sideNav = document.getElementById('spSideNav');
    sideNav?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-sp-target]');
      const target = btn && document.getElementById(btn.dataset.spTarget);
      if (!target) return;
      setActiveSidebarButton(sideNav, btn, 700);
      const reduce = !isMotionEnabled();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      const focusable = target.matches('input, select, textarea, button') ? target : target.querySelector('input, select, textarea, button');
      if (btn.dataset.spTarget !== 'spTop') focusable?.focus({ preventScroll: true });
    });

    const handleImagePreview = (inputEl, labelId) => {
      inputEl?.addEventListener('change', () => {
        const file = inputEl.files?.[0];
        if (!file) return;
        const label = document.getElementById(labelId);
        if (label) label.textContent = file.name;
        const previewImg = document.getElementById('previewSpImg');
        if (previewImg && file.type.startsWith('image/')) {
          const objUrl = URL.createObjectURL(file);
          previewImg.src = objUrl;
        }
      });
    };
    handleImagePreview(logoInput, 'spLogoFilename');
    handleImagePreview(photoInput, 'spPhotoFilename');

    pillsEl?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-amount]');
      if (!btn) return;
      pillsEl.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      const amountLabel = btn.textContent.trim();
      const previewAmt = document.getElementById('previewSpAmount');
      if (previewAmt) previewAmt.textContent = `${amountLabel} • SETARA`;
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const brand = (nameEl?.value || 'UMKM Lokal').trim();
      const category = (catEl?.value || 'UMKM').trim();
      const pic = (picEl?.value || '-').trim();
      const wa = (waEl?.value || '-').trim();
      const ig = (igEl?.value || '-').trim();
      const desc = (descEl?.value || '-').trim();
      const activePill = pillsEl?.querySelector('button.is-active');
      const amountLabel = activePill ? activePill.textContent.trim() : 'Rp1.000.000';

      // Formulir ini hanya pintu masuk: data dibawa ke Daftar Mandiri (formulir resmi yang masuk ke sistem).
      const CATEGORY_KEY = { 'Kuliner & Kopi': 'kuliner', 'Fashion & Merch': 'fashion', 'Jasa Kreatif & Desain': 'jasa-kreatif', 'Gaming & Teknologi': 'teknologi', 'Komunitas Lokal': 'komunitas' };
      const amount = Number(activePill?.dataset.amount) || '';
      try {
        sessionStorage.setItem('gigs2026_prefill', JSON.stringify({
          type: 'sponsor',
          fields: { name: nameEl?.value.trim() || '', sponsorCategory: CATEGORY_KEY[category] || 'lainnya', pic: picEl?.value.trim() || '', whatsapp: waEl?.value.trim() || '', instagram: igEl?.value.trim() || '', description: descEl?.value.trim() || '', amount },
        }));
      } catch {}
      window.location.href = '/event/gigs-akhir-tahun-2026/daftar';
      return;
      // eslint-disable-next-line no-unreachable

      const pubBadge = document.getElementById('spPubBadge');
      if (pubBadge) {
        pubBadge.textContent = 'PENGAJUAN TERCATAT';
        pubBadge.className = 'gigs-badge gigs-badge-warning';
      }
      const pubStepper = document.getElementById('spPubStepper');
      const pubSteps = pubStepper ? [...pubStepper.querySelectorAll(':scope > div')] : [];
      pubSteps.forEach((step) => step.classList.remove('is-current'));
      pubSteps[0]?.classList.add('is-done');
      pubSteps[1]?.classList.add('is-current');

      const waText = encodeURIComponent(
        `Halo Panitia GIGS Akhir Tahun 2026,\nSaya ingin mendaftar sebagai Sponsor UMKM:\n\n• Brand: ${brand}\n• Kategori: ${category}\n• PIC: ${pic} (${wa})\n• Instagram: ${ig}\n• Paket Kontribusi: ${amountLabel} (Manfaat Setara)\n• Deskripsi: ${desc}`
      );
      const notice = document.getElementById('sponsorFormNotice');
      if (notice) {
        notice.hidden = false;
        notice.innerHTML = `
          <strong>Minat sponsor "${brand.replace(/[<>&"]/g, '')}" (${amountLabel}) siap dikirim.</strong>
          <div>Langkah 2: kirim pesan ke WhatsApp Panitia. Transfer hanya setelah panitia memberi rekening resmi dan kunci akses Portal Sponsor (langkah 3–4).</div>
          <div class="gigs-form-notice-actions">
            <a class="gigs-wa-cta" href="https://wa.me/6281260002026?text=${waText}" target="_blank" rel="noopener noreferrer">Kirim via WhatsApp Panitia &rarr;</a>
            <a class="gigs-portal-cta" href="/event/gigs-akhir-tahun-2026/daftar">Daftar mandiri sebagai sponsor &rarr;</a>
          </div>`;
      }
    });
  }

  // Interactive Creator Portal Registration Flow
  function setupCreatorPortal() {
    const form = document.getElementById('creatorQuickForm');
    const syncCreatorDashboard = () => {
      const saved = getSavedCreators();
      // Hanya data nyata: pendaftaran yang tersimpan di perangkat ini.
      // "Dalam Review" & "Disetujui" tetap 0 karena kurasi resmi terjadi di Portal Kreator.
      const myCountEl = document.getElementById('creatorKpiMyCount');
      if (myCountEl) myCountEl.textContent = String(saved.length);
      const badgeEl = document.getElementById('creatorStatusBadge');
      if (badgeEl && saved.length > 0) {
        badgeEl.textContent = 'MENUNGGU KONFIRMASI';
        badgeEl.className = 'gigs-badge gigs-badge-warning';
      }

      if (saved.length > 0) {
        const latest = saved[0];
        const catLabel = CREATOR_CATEGORIES.find((c) => c.key === latest.cat)?.label || 'BAND LOKAL';
        const titleEl = document.getElementById('creatorStatusTitle');
        const metaEl = document.getElementById('creatorStatusMeta');
        const subEl = document.getElementById('creatorStatusSub');
        if (titleEl) titleEl.textContent = latest.name;
        if (metaEl) metaEl.textContent = `Kategori: ${catLabel} • Kontak: ${latest.wa}`;
        if (subEl) subEl.textContent = `Tersimpan di perangkat ini. Kirim konfirmasi WhatsApp ke panitia agar masuk antrean kurasi. Kebutuhan teknis: ${latest.tech || 'standar panggung'}.`;
      }
    };

    syncCreatorDashboard();

    // Dashboard side menu: jump to the matching part of this page.
    const dashNav = document.getElementById('crDashNav');
    dashNav?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cr-target]');
      const target = btn && document.getElementById(btn.dataset.crTarget);
      if (!target) return;
      setActiveSidebarButton(dashNav, btn, 700);
      const reduce = !isMotionEnabled();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      if (target.matches('input, textarea, select')) target.focus({ preventScroll: true });
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (document.getElementById('crName')?.value || '').trim();
      const wa = (document.getElementById('crWa')?.value || '').trim();
      const portfolio = (document.getElementById('crPortfolio')?.value || '').trim();
      const tech = (document.getElementById('crTech')?.value || '').trim();
      if (!name || !wa) return;

      const catObj = CREATOR_CATEGORIES.find((c) => c.key === state.selectedCreatorCat) || CREATOR_CATEGORIES[0];
      const isLink = /^https:\/\//i.test(portfolio);
      try {
        sessionStorage.setItem('gigs2026_prefill', JSON.stringify({
          type: 'creator',
          fields: { name, whatsapp: wa, creatorCategory: catObj.key, tech, portfolio: isLink ? portfolio : '', instagram: isLink ? '' : portfolio.replace(/^@/, '') },
        }));
      } catch {}
      window.location.href = '/event/gigs-akhir-tahun-2026/daftar';
      return;
      // eslint-disable-next-line no-unreachable
      const entry = {
        name,
        wa,
        portfolio,
        tech,
        cat: catObj.key,
        createdAt: new Date().toISOString(),
      };

      try {
        const saved = getSavedCreators();
        saved.unshift(entry);
        localStorage.setItem('gigs2026_creator_drafts', JSON.stringify(saved.slice(0, 30)));
      } catch {}

      syncCreatorDashboard();
      renderCommunityGrid();

      document.querySelectorAll('#creatorRegSteps li').forEach((li, idx) => {
        li.classList.toggle('is-active', idx === 4);
      });

      const waText = encodeURIComponent(
        `Halo Koordinator Talent GIGS 2026 (Ace),\nSaya mendaftar di Portal Kreator:\n\n• Nama Talent/Grup: ${name}\n• Kategori: ${catObj.label}\n• WhatsApp: ${wa}\n• Portofolio/IG: ${portfolio || '-'}\n• Kebutuhan Teknis: ${tech || 'Standar'}`
      );
      const notice = document.getElementById('creatorApplyNotice');
      if (notice) {
        notice.hidden = false;
        notice.innerHTML = `
          <strong>Pendaftaran "${name.replace(/[<>&"]/g, '')}" (${catObj.label}) tercatat di Dashboard Kreator!</strong>
          <div class="gigs-form-notice-actions">
            <a class="gigs-wa-cta" href="https://wa.me/6281260002026?text=${waText}" target="_blank" rel="noopener noreferrer">Konfirmasi WhatsApp (Ace) &rarr;</a>
            <a class="gigs-portal-cta" href="/event/gigs-akhir-tahun-2026/daftar">Daftar mandiri sebagai kreator &rarr;</a>
          </div>`;
      }
      form.reset();
    });
  }

  function setupOrganizerSidebar() {
    const orgNav = document.getElementById('orgSideNav');
    orgNav?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-org-side-target]');
      const target = btn && document.getElementById(btn.dataset.orgSideTarget);
      if (!target) return;
      setActiveSidebarButton(orgNav, btn, 700);
      target.scrollIntoView({ behavior: isMotionEnabled() ? 'smooth' : 'auto', block: 'start' });
    });
  }

  function setupSidebarScrollSpy() {
    if (typeof IntersectionObserver !== 'function') return;
    const pairs = [
      ['#spSideNav', 'data-sp-target'],
      ['#crDashNav', 'data-cr-target'],
      ['#orgSideNav', 'data-org-side-target'],
    ];

    pairs.forEach(([navSelector, attr]) => {
      const nav = document.querySelector(navSelector);
      const screen = nav?.closest('.gigs-screen');
      if (!nav || !screen) return;

      const targets = new Map();
      nav.querySelectorAll(`button[${attr}]`).forEach((btn) => {
        const targetId = btn.getAttribute(attr);
        if (!targetId || targets.has(targetId)) return;
        const el = document.getElementById(targetId);
        if (el) targets.set(targetId, { el, btn });
      });
      if (!targets.size) return;

      const intersectingIds = new Set();
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) intersectingIds.add(entry.target.id);
            else intersectingIds.delete(entry.target.id);
          });
          if (screen.hidden || (sidebarSpyLockUntil.get(nav) || 0) > Date.now() || !intersectingIds.size) return;

          const activeEntry = Array.from(targets.entries()).find(([id]) => intersectingIds.has(id));
          if (!activeEntry) return;
          const [targetId, { btn }] = activeEntry;
          const currentActive = nav.querySelector('button.is-active');
          if (currentActive && currentActive.getAttribute(attr) === targetId) return;
          setActiveSidebarButton(nav, btn);
        },
        { rootMargin: '-20% 0px -65% 0px', threshold: 0 }
      );

      targets.forEach(({ el }) => observer.observe(el));
    });
  }

  // Export CSV + Print on Transparansi Screen
  function setupRabExports() {
    document.getElementById('btnExportCsv')?.addEventListener('click', () => {
      const data = FINANCE_MODES[state.mode];
      const rows = [['No', 'Pos Anggaran', 'Anggaran (Rp)', 'Realisasi (Rp)', 'Sisa (Rp)', 'Status']];
      RAB_ITEMS.forEach((item, i) => {
        const real = ledgerSummary ? ledgerSummary.expenses.find((entry) => entry.budget_code === item.no)?.amount || 0 : data.realisasi[i] || 0;
        const sisa = item.budget - real;
        rows.push([item.no, item.pos, item.budget, real, sisa,
          ledgerSummary && real ? (sisa < 0 ? 'Melebihi anggaran' : 'Realisasi tercatat') : item.status]);
      });
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GIGS_2026_RAB_${ledgerSummary ? 'ledger' : state.mode}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btnPrintRab')?.addEventListener('click', () => {
      window.print();
    });
  }

  // Real-time Hero Countdown (Asia/Jakarta WIB) + per-digit vertical slot-roll
  function setupHeroCountdown() {
    const grid = document.getElementById('heroCountdownGrid');
    const startedEl = document.getElementById('heroCountdownStarted');
    if (!grid || !startedEl) return;

    const targetMs = () => EVENT_CONFIG.dateMs;
    const forceStarted = urlParams.get('cd') === 'started';
    const prevValues = {};
    let timerId = 0;

    const computeRemaining = (nowMs) => {
      if (forceStarted || !Number.isFinite(targetMs())) {
        return { started: true, days: '00', hours: '00', minutes: '00', seconds: '00' };
      }
      const diffMs = targetMs() - nowMs;
      if (diffMs <= 0) {
        return { started: true, days: '00', hours: '00', minutes: '00', seconds: '00' };
      }
      const totalSeconds = Math.floor(diffMs / 1000);
      return {
        started: false,
        days: String(Math.floor(totalSeconds / 86400)).padStart(2, '0'),
        hours: String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, '0'),
        minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
        seconds: String(totalSeconds % 60).padStart(2, '0'),
      };
    };

    const renderUnit = (unitKey, valueStr, animateChanges) => {
      const valueEl = grid.querySelector(`[data-cd-value="${unitKey}"]`);
      if (!valueEl) return;

      const chars = valueStr.split('');
      const prevStr = prevValues[unitKey];
      const useMotion = animateChanges && isMotionEnabled() && typeof Element.prototype.animate === 'function';

      if (valueEl.children.length !== chars.length) {
        valueEl.innerHTML = '';
        chars.forEach((ch) => {
          const slot = document.createElement('span');
          slot.className = 'gigs-cd-digit-slot';
          slot.setAttribute('aria-hidden', 'true');
          const digit = document.createElement('span');
          digit.className = 'gigs-cd-digit';
          digit.textContent = ch;
          slot.appendChild(digit);
          valueEl.appendChild(slot);
        });
        prevValues[unitKey] = valueStr;
        return;
      }

      let anyChanged = false;
      chars.forEach((ch, idx) => {
        if (prevStr && prevStr[idx] === ch) return;
        anyChanged = true;
        const slot = valueEl.children[idx];
        const currentSpan = slot.querySelector('.gigs-cd-digit:not(.is-exiting)');
        if (!useMotion || !currentSpan) {
          if (currentSpan) {
            currentSpan.textContent = ch;
          } else {
            const fallback = document.createElement('span');
            fallback.className = 'gigs-cd-digit';
            fallback.textContent = ch;
            slot.appendChild(fallback);
          }
          return;
        }

        const oldSpan = currentSpan;
        oldSpan.classList.add('is-exiting');
        oldSpan.style.position = 'absolute';
        oldSpan.style.inset = '0';

        const nextSpan = document.createElement('span');
        nextSpan.className = 'gigs-cd-digit';
        nextSpan.textContent = ch;
        slot.appendChild(nextSpan);

        const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
        oldSpan.animate(
          [
            { transform: 'translate3d(0, 0%, 0)', opacity: 1 },
            { transform: 'translate3d(0, -100%, 0)', opacity: 0 },
          ],
          { duration: 240, easing, fill: 'forwards' },
        ).onfinish = () => oldSpan.remove();

        nextSpan.animate(
          [
            { transform: 'translate3d(0, 100%, 0)', opacity: 0 },
            { transform: 'translate3d(0, 0%, 0)', opacity: 1 },
          ],
          { duration: 240, easing, fill: 'both' },
        );
      });

      if (anyChanged && unitKey === 'seconds' && useMotion) {
        valueEl.animate(
          [{ transform: 'scale(1.032)' }, { transform: 'scale(1)' }],
          { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
      }

      prevValues[unitKey] = valueStr;
    };

    const tick = (isInitial) => {
      const state = computeRemaining(Date.now());
      if (state.started) {
        if (timerId) {
          window.clearInterval(timerId);
          timerId = 0;
        }
        grid.hidden = true;
        startedEl.hidden = false;
        if (!isInitial && isMotionEnabled() && typeof startedEl.animate === 'function') {
          startedEl.animate(
            [
              { opacity: 0, transform: 'translate3d(0, 8px, 0) scale(0.985)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            ],
            { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
          );
        }
        return false;
      }

      startedEl.hidden = true;
      grid.hidden = false;
      renderUnit('days', state.days, !isInitial);
      renderUnit('hours', state.hours, !isInitial);
      renderUnit('minutes', state.minutes, !isInitial);
      renderUnit('seconds', state.seconds, !isInitial);
      return true;
    };

    const shouldRun = tick(true);
    if (shouldRun) {
      timerId = window.setInterval(() => tick(false), 1000);
    }
  }

  // /oil-motion + /fixing-motion-performance: Coalesced rAF Luxury Concert Stage Rig & Velocity Ticker
  function setupOilMotionHero() {
    const hero = document.getElementById('home');
    const leftBeam = document.querySelector('[data-oil-beam="left"]');
    const rightBeam = document.querySelector('[data-oil-beam="right"]');
    const frontBeams = document.querySelector('[data-oil-front-beams]');
    const orb = document.querySelector('[data-oil-orb]');
    const ember = document.querySelector('[data-oil-ember]');
    const backlight = document.querySelector('[data-oil-backlight]');
    const haloBurst = document.querySelector('[data-oil-halo-burst]');
    const haloCore = document.querySelector('[data-oil-halo-core]');
    const stagePhoto = document.querySelector('[data-oil-stage]');
    const tickerWrap = hero?.querySelector('.gigs-ticker-wrap');
    const tickerTrack = hero?.querySelector('.gigs-ticker-track');
    const decodeEl = hero?.querySelector('[data-hero-decode]');
    if (!hero || !leftBeam || !rightBeam || !orb) return;

    const canAnimateHero = () => isMotionEnabled();

    if (decodeEl && canAnimateHero() && urlParams.get('qa') !== '1' && !decodeEl.dataset.decoded) {
      decodeEl.dataset.decoded = '1';
      const targetText = decodeEl.dataset.heroDecode || decodeEl.textContent || 'DESEMBER 2026';
      const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#';
      const startTime = performance.now();
      const duration = 420;
      const step = (now) => {
        if (!canAnimateHero()) {
          decodeEl.textContent = targetText;
          return;
        }
        const progress = Math.min(1, (now - startTime) / duration);
        const lockedCount = Math.floor(progress * targetText.length);
        let out = '';
        for (let i = 0; i < targetText.length; i++) {
          const ch = targetText[i];
          if (ch === ' ' || ch === '/' || i < lockedCount) out += ch;
          else out += glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        decodeEl.textContent = out;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          decodeEl.textContent = targetText;
        }
      };
      requestAnimationFrame(step);
    }

    let heroVisible = true;
    let rafId = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let targetScroll = 0;
    let currentScroll = 0;
    let lastScrollY = window.scrollY || 0;
    let baseTickerRate = 1.0;
    let tickerRateBoost = 0;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          heroVisible = Boolean(entries[0]?.isIntersecting);
          if (!heroVisible && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        },
        { threshold: 0.02 }
      );
      io.observe(hero);
    }

    const render = () => {
      rafId = 0;
      if (!heroVisible || !canAnimateHero()) return;

      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const dScroll = targetScroll - currentScroll;
      currentX += dx * 0.1;
      currentY += dy * 0.1;
      currentScroll += dScroll * 0.14;
      tickerRateBoost *= 0.9;
      if (tickerRateBoost < 0.002) tickerRateBoost = 0;

      leftBeam.style.transform = `translate3d(${(currentX * 42 - currentScroll * 24).toFixed(2)}px, ${(currentY * 22 + currentScroll * 16).toFixed(2)}px, 0)`;
      rightBeam.style.transform = `translate3d(${(-currentX * 42 + currentScroll * 24).toFixed(2)}px, ${(currentY * 22 + currentScroll * 16).toFixed(2)}px, 0)`;
      if (frontBeams) {
        frontBeams.style.transform = `translate3d(${(currentX * 28 - currentScroll * 16).toFixed(2)}px, ${(currentY * 14 + currentScroll * 12).toFixed(2)}px, 0)`;
      }
      orb.style.transform = `translate3d(${(currentX * 52).toFixed(2)}px, ${(currentY * 30 + currentScroll * 22).toFixed(2)}px, 0)`;
      if (backlight) {
        backlight.style.transform = `translate3d(${(currentX * 24).toFixed(2)}px, ${(currentY * 14).toFixed(2)}px, 0)`;
      }
      if (ember) {
        ember.style.transform = `translate3d(${(-currentX * 34).toFixed(2)}px, ${(-currentY * 24 - currentScroll * 28).toFixed(2)}px, 0)`;
      }
      if (stagePhoto) {
        stagePhoto.style.transform = `translate3d(${(-currentX * 18).toFixed(2)}px, ${(-currentY * 10 + currentScroll * 20).toFixed(2)}px, 0)`;
      }
      if (haloBurst) {
        haloBurst.style.transform = `translate3d(${(currentX * 26).toFixed(2)}px, ${(currentY * 16 + currentScroll * 14).toFixed(2)}px, 0)`;
      }
      if (haloCore) {
        haloCore.style.transform = `translate3d(${(currentX * 32).toFixed(2)}px, ${(currentY * 20 + currentScroll * 18).toFixed(2)}px, 0)`;
      }

      const tickerAnim = tickerTrack?.getAnimations?.()[0];
      if (tickerAnim && typeof tickerAnim.playbackRate === 'number') {
        const nextRate = Number((baseTickerRate + tickerRateBoost).toFixed(2));
        if (Math.abs(tickerAnim.playbackRate - nextRate) > 0.01) {
          tickerAnim.playbackRate = nextRate;
        }
      }

      if (
        Math.abs(dx) > 0.003 ||
        Math.abs(dy) > 0.003 ||
        Math.abs(dScroll) > 0.003 ||
        tickerRateBoost > 0.003
      ) {
        rafId = requestAnimationFrame(render);
      }
    };

    const scheduleRender = () => {
      if (!rafId && heroVisible && canAnimateHero()) {
        rafId = requestAnimationFrame(render);
      }
    };

    hero.addEventListener(
      'pointermove',
      (e) => {
        if (!heroVisible || !canAnimateHero()) return;
        const rect = hero.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        scheduleRender();
      },
      { passive: true }
    );

    hero.addEventListener(
      'pointerleave',
      () => {
        targetX = 0;
        targetY = 0;
        scheduleRender();
      },
      { passive: true }
    );

    window.addEventListener(
      'scroll',
      () => {
        if (!heroVisible || !canAnimateHero()) return;
        const rect = hero.getBoundingClientRect();
        const heroHeight = Math.max(1, rect.height);
        targetScroll = Math.max(0, Math.min(1, -rect.top / heroHeight));
        const scrollY = window.scrollY || 0;
        const deltaY = Math.abs(scrollY - lastScrollY);
        lastScrollY = scrollY;
        tickerRateBoost = Math.min(2.6, Math.max(tickerRateBoost, deltaY * 0.045));
        scheduleRender();
      },
      { passive: true }
    );

    if (tickerWrap) {
      tickerWrap.addEventListener(
        'pointerenter',
        () => {
          baseTickerRate = 0.35;
          scheduleRender();
        },
        { passive: true }
      );
      tickerWrap.addEventListener(
        'pointerleave',
        () => {
          baseTickerRate = 1.0;
          scheduleRender();
        },
        { passive: true }
      );
    }
  }

  function setupVenueAnimations() {
    const venue = document.getElementById('venue');
    if (!venue) return;

    const telemetry = document.getElementById('venueTelemetryStrip');
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#';
    const activateVenue = () => {
      if (venue.classList.contains('is-venue-active')) return;
      venue.classList.add('is-venue-active');

      // Telemetry tactical character scramble decode on first reveal
      if (telemetry && isMotionEnabled() && !telemetry.dataset.decoded) {
        telemetry.dataset.decoded = '1';
        const targetText = telemetry.dataset.scramble || 'EVENT VENUE // OPEN LOCATION // TEBING TINGGI';
        const startTime = performance.now();
        const duration = 620;
        const step = (now) => {
          const progress = Math.min(1, (now - startTime) / duration);
          const lockedCount = Math.floor(progress * targetText.length);
          let out = '';
          for (let i = 0; i < targetText.length; i++) {
            const ch = targetText[i];
            if (ch === ' ' || ch === '/' || i < lockedCount) out += ch;
            else out += glyphs[Math.floor(Math.random() * glyphs.length)];
          }
          telemetry.textContent = out;
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            telemetry.innerHTML =
              '<span>EVENT VENUE</span><span class="gigs-venue-tel-sep" aria-hidden="true">//</span><span>OPEN LOCATION</span><span class="gigs-venue-tel-sep" aria-hidden="true">//</span><span>TEBING TINGGI</span>';
          }
        };
        requestAnimationFrame(step);
      }
    };

    if (!isMotionEnabled() || !('IntersectionObserver' in window)) {
      activateVenue();
    } else {
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            activateVenue();
            obs.disconnect();
          }
        },
        { threshold: 0.14 }
      );
      obs.observe(venue);
    }

    // Light scroll-scrubbed multi-depth parallax (rAF passive scroll + progressive GSAP ScrollTrigger upgrade)
    let scrollTicking = false;
    const applyParallax = () => {
      scrollTicking = false;
      if (!isMotionEnabled()) return;
      const rect = venue.getBoundingClientRect();
      const vh = window.innerHeight || 900;
      if (rect.bottom < -120 || rect.top > vh + 120) return;
      const progress = Math.max(-1, Math.min(1, (vh * 0.5 - (rect.top + rect.height * 0.5)) / vh));
      venue.style.setProperty('--venue-parallax-y', `${(progress * 26).toFixed(1)}px`);
      venue.style.setProperty('--venue-parallax-scale', (1.05 - Math.abs(progress) * 0.03).toFixed(3));
      venue.style.setProperty('--venue-ribbon-x', `${(progress * -22).toFixed(1)}px`);
    };

    window.addEventListener(
      'scroll',
      () => {
        if (!scrollTicking) {
          scrollTicking = true;
          requestAnimationFrame(applyParallax);
        }
      },
      { passive: true }
    );
    applyParallax();

    // Progressive non-blocking GSAP + ScrollTrigger integration
    const attachGsap = () => {
      if (!window.gsap || !window.ScrollTrigger || !isMotionEnabled()) return;
      window.gsap.registerPlugin(window.ScrollTrigger);
      window.gsap.to('#venueBuildingImg', {
        yPercent: 6,
        scale: 1.0,
        ease: 'none',
        scrollTrigger: { trigger: venue, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      });
    };
    if (window.gsap && window.ScrollTrigger) {
      attachGsap();
    } else if (navigator.onLine !== false) {
      const s1 = document.createElement('script');
      s1.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js';
      s1.async = true;
      s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/ScrollTrigger.min.js';
        s2.async = true;
        s2.onload = attachGsap;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s1);
    }
  }

  function setupSuryaTechAnimation() {
    const section = document.getElementById('digital-creative-movement');
    const photoClip = document.getElementById('suryaPhotoClip');
    const photoBase = photoClip?.querySelector('.gcm-photoBase');
    if (!section || !photoClip || !photoBase) return;

    const NAT_W = 1086;
    const NAT_H = 1448;

    const mapNaturalRect = (nx1, ny1, nx2, ny2) => {
      const cw = photoClip.clientWidth;
      const ch = photoClip.clientHeight;
      if (!cw || !ch) return null;

      const isDesktop = window.matchMedia('(min-width: 921px)').matches;
      const isMobile = window.matchMedia('(max-width: 620px)').matches;
      const objY = isDesktop ? 0.32 : isMobile ? 0.54 : 0.53;
      const extraScale = isDesktop ? 1.08 : 1;
      const origX = isDesktop ? 0.51 : 0.5;
      const origY = isDesktop ? 0.38 : 0.5;

      const coverScale = Math.max(cw / NAT_W, ch / NAT_H);
      const rw = NAT_W * coverScale;
      const rh = NAT_H * coverScale;
      const baseLeft = (cw - rw) * 0.5;
      const baseTop = (ch - rh) * objY;

      const toPx = (nx, ny) => {
        let px = baseLeft + (nx / NAT_W) * rw;
        let py = baseTop + (ny / NAT_H) * rh;
        const tx = origX * cw;
        const ty = origY * ch;
        px = tx + (px - tx) * extraScale;
        py = ty + (py - ty) * extraScale;
        return [px, py];
      };

      const [x1, y1] = toPx(nx1, ny1);
      const [x2, y2] = toPx(nx2, ny2);
      return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
    };

    const syncMetrics = () => {
      // Lock SVG Red Laser contour container 1:1 with viewBox="300 310 660 320" -> [300..960, 310..630]
      const laserRect = mapNaturalRect(300, 310, 960, 630);
      if (laserRect) {
        section.style.setProperty('--surya-laser-left', `${laserRect.left.toFixed(1)}px`);
        section.style.setProperty('--surya-laser-top', `${laserRect.top.toFixed(1)}px`);
        section.style.setProperty('--surya-laser-width', `${laserRect.width.toFixed(1)}px`);
        section.style.setProperty('--surya-laser-height', `${laserRect.height.toFixed(1)}px`);
      }
    };

    syncMetrics();
    window.addEventListener('resize', syncMetrics, { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(syncMetrics).observe(photoClip);
    }

    const activateSurya = () => {
      syncMetrics();
      section.classList.add('is-surya-active');
    };

    if (!isMotionEnabled() || !('IntersectionObserver' in window)) {
      activateSurya();
    } else {
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            activateSurya();
            obs.disconnect();
          }
        },
        { threshold: 0.06 }
      );
      obs.observe(section);
    }

    // Gentle 3D depth parallax behind the laptop
    bindPointerParallax(section, (el, curX, curY) => {
      el.style.setProperty('--gcm-bg-x', `${(-curX * 3.5).toFixed(2)}px`);
      el.style.setProperty('--gcm-bg-y', `${(-curY * 2.5).toFixed(2)}px`);
      el.style.setProperty('--gcm-surya-x', `${(curX * 5.5).toFixed(2)}px`);
      el.style.setProperty('--gcm-surya-y', `${(curY * 3.5).toFixed(2)}px`);
      el.style.setProperty('--gcm-surya-rx', `${(-curY * 2.5).toFixed(2)}deg`);
      el.style.setProperty('--gcm-surya-ry', `${(curX * 3.2).toFixed(2)}deg`);
    });
  }

  function bindPointerParallax(targetEl, applyVars) {
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let parallaxRaf = 0;

    const stepParallax = () => {
      parallaxRaf = 0;
      if (!isMotionEnabled()) return;
      curX += (targetX - curX) * 0.14;
      curY += (targetY - curY) * 0.14;
      applyVars(targetEl, curX, curY);
      if (Math.abs(targetX - curX) > 0.002 || Math.abs(targetY - curY) > 0.002) {
        parallaxRaf = requestAnimationFrame(stepParallax);
      }
    };

    targetEl.addEventListener(
      'pointermove',
      (e) => {
        if (!isMotionEnabled()) return;
        const rect = targetEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        targetX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
        targetY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
        if (!parallaxRaf) parallaxRaf = requestAnimationFrame(stepParallax);
      },
      { passive: true }
    );

    targetEl.addEventListener(
      'pointerleave',
      () => {
        targetX = 0;
        targetY = 0;
        if (!parallaxRaf && isMotionEnabled()) parallaxRaf = requestAnimationFrame(stepParallax);
      },
      { passive: true }
    );
  }

  function setupAllianceParallax() {
    const banner = document.getElementById('allianceBanner');
    if (!banner) return;
    bindPointerParallax(banner, (el, curX, curY) => {
      el.style.setProperty('--alliance-x', `${(curX * 4).toFixed(2)}px`);
      el.style.setProperty('--alliance-y', `${(curY * 3).toFixed(2)}px`);
      el.style.setProperty('--alliance-rx', `${(-curY * 2.2).toFixed(2)}deg`);
      el.style.setProperty('--alliance-ry', `${(curX * 3).toFixed(2)}deg`);
    });
  }

  function setupSponsorSultan() {
    const ctaCard = document.getElementById('sponsorHeroCta');
    if (ctaCard) {
      bindPointerParallax(ctaCard, (el, curX, curY) => {
        el.style.setProperty('--sp-cta-x', `${(curX * 3.5).toFixed(2)}px`);
        el.style.setProperty('--sp-cta-y', `${(curY * 2.5).toFixed(2)}px`);
        el.style.setProperty('--sp-cta-rx', `${(-curY * 4.5).toFixed(2)}deg`);
        el.style.setProperty('--sp-cta-ry', `${(curX * 5.5).toFixed(2)}deg`);
      });
    }

    const sponsorGrid = document.getElementById('homeSponsorGrid');
    if (sponsorGrid && !sponsorGrid.dataset.spBound) {
      sponsorGrid.dataset.spBound = '1';
      sponsorGrid.addEventListener(
        'pointermove',
        (e) => {
          if (!isMotionEnabled()) return;
          const card = e.target.closest('.gigs-sp-slot');
          if (!card) return;
          const rect = card.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
          const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
          card.style.setProperty('--sp-glow-x', `${xPct.toFixed(1)}%`);
          card.style.setProperty('--sp-glow-y', `${yPct.toFixed(1)}%`);
        },
        { passive: true }
      );
      sponsorGrid.addEventListener('keydown', (e) => {
        const card = e.target.closest('article.gigs-sp-slot[data-screen]');
        if (!card) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateToScreen(card.dataset.screen || 'sponsor');
        }
      });
    }
  }

  function syncNavIndicator(targetBtn) {
    const navLinks = document.getElementById('mainNavLinks');
    if (!navLinks) return;
    const btn = targetBtn || navLinks.querySelector('.gigs-nav-item.is-active');
    if (!btn || btn.hidden || !btn.offsetWidth) {
      navLinks.style.setProperty('--nav-ind-opacity', '0');
      return;
    }
    navLinks.classList.add('has-indicator');
    navLinks.style.setProperty('--nav-ind-left', `${btn.offsetLeft}px`);
    navLinks.style.setProperty('--nav-ind-width', `${btn.offsetWidth}px`);
    navLinks.style.setProperty('--nav-ind-opacity', '1');
  }

  function setupNavbarSultan() {
    const navbar = document.getElementById('mainNavbar');
    const navLinks = document.getElementById('mainNavLinks');
    if (!navbar || !navLinks) return;

    const sectionOrder = ['#venue', '#lineup', '#program', '#tentang', '#home'];
    let rafId = 0;

    const updateNavScrollState = () => {
      rafId = 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      navbar.classList.toggle('is-scrolled', scrollY > 24);

      const docEl = document.documentElement;
      const scrollable = Math.max(1, docEl.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, scrollY / scrollable));
      navbar.style.setProperty('--nav-scroll-progress', progress.toFixed(4));

      if (state.screen === 'home') {
        const triggerY = Math.min(280, window.innerHeight * 0.34);
        let activeSelector = null;

        if (scrollY >= 80) {
          for (const sel of sectionOrder) {
            if (sel === '#home') continue;
            const secEl = document.querySelector(sel);
            if (!secEl) continue;
            const rect = secEl.getBoundingClientRect();
            if (rect.top <= triggerY) {
              activeSelector = sel;
              break;
            }
          }
        }

        const btns = navLinks.querySelectorAll('.gigs-nav-item');
        btns.forEach((btn) => {
          const isHomeBtn = btn.dataset.screen === 'home' && !btn.dataset.scroll;
          const isTarget = activeSelector ? btn.dataset.scroll === activeSelector : isHomeBtn;
          btn.classList.toggle('is-active', isTarget);
        });

        document.querySelectorAll('#mobileDrawer .gigs-drawer-nav button[data-screen="home"]').forEach((btn) => {
          const isHomeBtn = !btn.dataset.scroll;
          const isTarget = activeSelector ? btn.dataset.scroll === activeSelector : isHomeBtn;
          btn.classList.toggle('is-active', isTarget);
        });
      }

      if (!navLinks.matches(':hover')) {
        syncNavIndicator();
      }
    };

    const scheduleUpdate = () => {
      if (!rafId) rafId = requestAnimationFrame(updateNavScrollState);
    };

    navLinks.querySelectorAll('.gigs-nav-item').forEach((btn) => {
      btn.addEventListener('pointerenter', () => syncNavIndicator(btn));
    });
    navLinks.addEventListener('pointerleave', () => syncNavIndicator());

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    updateNavScrollState();
    document.fonts?.ready?.then(() => syncNavIndicator());
  }

  /**
   * Procedural Web Audio API + Lazy-Streamed Background Soundtrack Engine:
   * Streams /audio/gigs-underground-bg.webm (Opus) / .mp3 on demand after first paint,
   * applies real-time Web Audio mastering EQ presets & scroll ducking, with procedural
   * Drop-D full-band fallback if media loading is unavailable.
   */
  function setupStageAudioEngine() {
    const AUDIO_PREF_KEY = 'gigs_stage_audio_enabled';
    const AUDIO_PRESET_KEY = 'gigs_stage_audio_preset';
    const AUDIO_VOL_KEY = 'gigs_stage_audio_volume';
    const AUDIO_SFX_KEY = 'gigs_stage_audio_sfx';
    const VALID_PRESETS = new Set(['industrial', 'drone', 'swell']);
    const PRESET_STEP_MS = {
      industrial: 128,
      drone: 106,
      swell: 162,
    };
    const PRESET_EQ = {
      industrial: { lowDb: 2.5, midDb: 2.0, highHz: 16500, gain: 0.95 },
      drone: { lowDb: 4.5, midDb: 3.8, highHz: 18000, gain: 1.0 },
      swell: { lowDb: 3.2, midDb: -1.5, highHz: 980, gain: 0.88 },
    };

    const readStoredPref = (key) => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    };

    const writeStoredPref = (key, val) => {
      try {
        sessionStorage.setItem(key, String(val));
      } catch {
        // Ignore restricted storage contexts
      }
    };

    const savedPref = readStoredPref(AUDIO_PREF_KEY);
    const savedPreset = readStoredPref(AUDIO_PRESET_KEY);
    const rawVol = readStoredPref(AUDIO_VOL_KEY);
    const savedVol = rawVol === null ? NaN : Number(rawVol);
    const savedSfx = readStoredPref(AUDIO_SFX_KEY);
    const saveData = Boolean(navigator.connection?.saveData);

    const initialVol = Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 100 ? savedVol / 100 : 0.85;
    const initialPreset = VALID_PRESETS.has(savedPreset) ? savedPreset : 'industrial';
    const shouldAutoPlay = savedPref !== '0' && !urlParams.get('qa') && !state.reducedMotion && !saveData;

    const audioState = {
      enabled: false,
      autoArmed: false,
      sfxEnabled: savedSfx === '1',
      preset: initialPreset,
      volume: initialVol,
      mixerOpen: false,
      initialized: false,
      ctx: null,
      masterGain: null,
      compressor: null,
      analyser: null,
      freqData: null,
      ambientGain: null,
      ambientFilter: null,
      guitarInput: null,
      guitarBusGain: null,
      bassBusGain: null,
      drumBusGain: null,
      trackEl: null,
      trackSourceNode: null,
      trackGain: null,
      trackLowShelf: null,
      trackMidPeak: null,
      trackHighCut: null,
      trackFailed: false,
      trackBlobUrl: null,
      triedCompatFetch: false,
      compatLoading: false,
      blockedByAutoplay: false,
      sectionTrackMult: 1.0,
      sectionHighCapHz: 18000,
      grooveTimer: null,
      analyserTimer: null,
      stepIndex: 0,
      noiseBuffer: null,
      lastHoverAt: 0,
      lastHoverEl: null,
      currentSectionId: 'home',
      targetAmbientGain: 0.022,
      targetGuitarGain: 0.78,
      targetFilterFreq: 165,
      resumeUnlockerBound: false,
      detachResumeUnlocker: null,
    };

    const canSynthesize = () =>
      Boolean(audioState.enabled && audioState.ctx && audioState.ctx.state !== 'closed' && !document.hidden);

    const canPlaySfx = () => Boolean(canSynthesize() && audioState.sfxEnabled);

    const getActiveRoomGain = () => (audioState.trackFailed ? audioState.targetAmbientGain : 0.004);

    const applyTrackMastering = () => {
      const eq = PRESET_EQ[audioState.preset] || PRESET_EQ.industrial;
      if (audioState.trackEl) {
        audioState.trackEl.volume = audioState.trackSourceNode
          ? 1.0
          : Math.max(0, Math.min(1, audioState.volume * 0.92 * audioState.sectionTrackMult));
      }
      if (!audioState.ctx) return;
      const now = audioState.ctx.currentTime;
      audioState.trackLowShelf?.gain.setTargetAtTime(eq.lowDb, now, 0.08);
      audioState.trackMidPeak?.gain.setTargetAtTime(eq.midDb, now, 0.08);
      audioState.trackHighCut?.frequency.setTargetAtTime(Math.min(eq.highHz, audioState.sectionHighCapHz), now, 0.14);
      audioState.trackGain?.gain.setTargetAtTime(eq.gain * audioState.sectionTrackMult, now, 0.12);
    };

    const connectTrackToContextIfRunning = () => {
      if (
        !audioState.ctx ||
        audioState.ctx.state !== 'running' ||
        !audioState.trackEl ||
        !audioState.trackLowShelf ||
        audioState.trackSourceNode
      ) {
        return;
      }
      try {
        const srcNode = audioState.ctx.createMediaElementSource(audioState.trackEl);
        srcNode.connect(audioState.trackLowShelf);
        audioState.trackSourceNode = srcNode;
        applyTrackMastering();
      } catch {
        // Keep direct HTMLAudioElement playback when Web Audio attachment is unavailable
      }
    };

    const ensureTrackElement = () => {
      if (audioState.trackEl) return audioState.trackEl;
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'none';
      audio.crossOrigin = 'anonymous';
      audio.playsInline = true;

      const canOpus = Boolean(
        audio.canPlayType?.('audio/webm; codecs="opus"') || audio.canPlayType?.('audio/webm')
      );
      audio.src = canOpus ? '/event/gigs-akhir-tahun-2026/audio/gigs-underground-bg.webm' : '/event/gigs-akhir-tahun-2026/audio/gigs-underground-bg.mp3';

      audio.addEventListener('playing', () => {
        audioState.blockedByAutoplay = false;
        audioState.trackFailed = false;
      });

      audio.addEventListener('error', () => {
        if (!audioState.triedCompatFetch && !audioState.compatLoading) {
          audioState.triedCompatFetch = true;
          audioState.compatLoading = true;
          fetch('/event/gigs-akhir-tahun-2026/official-assets/gigs-underground-bg.webp')
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.arrayBuffer();
            })
            .then((buf) => {
              const blob = new Blob([buf], { type: 'audio/webm' });
              const blobUrl = URL.createObjectURL(blob);
              audioState.trackBlobUrl = blobUrl;
              audioState.compatLoading = false;
              audio.src = blobUrl;
              applyTrackMastering();
              if (audioState.enabled && !document.hidden) {
                const p = audio.play();
                if (p && typeof p.catch === 'function') {
                  p.catch(() => {
                    audioState.blockedByAutoplay = true;
                    bindAutoplayResume();
                  });
                }
              }
            })
            .catch(() => {
              audioState.compatLoading = false;
              audioState.trackFailed = true;
              if (audioState.enabled && !audioState.grooveTimer) {
                const stepMs = PRESET_STEP_MS[audioState.preset] || 128;
                stepGrooveLoop();
                audioState.grooveTimer = window.setInterval(stepGrooveLoop, stepMs);
              }
            });
          return;
        }
        if (!audioState.compatLoading) {
          audioState.trackFailed = true;
          if (audioState.enabled && !audioState.grooveTimer) {
            const stepMs = PRESET_STEP_MS[audioState.preset] || 128;
            stepGrooveLoop();
            audioState.grooveTimer = window.setInterval(stepGrooveLoop, stepMs);
          }
        }
      });

      audioState.trackEl = audio;
      return audio;
    };

    const buildNoiseBuffer = (ctx, durationSec = 2.5) => {
      const sampleRate = ctx.sampleRate || 44100;
      const frameCount = Math.floor(sampleRate * durationSec);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < frameCount; i++) {
        const white = Math.random() * 2 - 1;
        // Soft pink-ish tilt to emulate warm tube/vinyl room noise
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.08) * 0.24;
      }
      return buffer;
    };

    const makeDistortionCurve = (drive = 28) => {
      const samples = 2048;
      const curve = new Float32Array(samples);
      const k = Math.max(1, drive);
      const offset = Math.tanh(0.06 * k * 0.19);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh((x + 0.06) * k * 0.19) - offset;
      }
      return curve;
    };

    const effectiveMasterGain = () => Math.max(0.0001, Math.min(1, audioState.volume) * 0.92);

    const ensureContext = () => {
      if (audioState.ctx) {
        if (audioState.ctx.state === 'suspended') {
          audioState.ctx.resume().catch(() => {});
        }
        return audioState.ctx;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      let ctx;
      try {
        ctx = new AudioCtx();
      } catch {
        return null;
      }

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, ctx.currentTime);
      compressor.knee.setValueAtTime(18, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.16, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(effectiveMasterGain(), ctx.currentTime);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      compressor.connect(masterGain);
      masterGain.connect(analyser);
      analyser.connect(ctx.destination);

      // Guitar Overdrive Amp + 4x12 Cabinet Bus
      const guitarDrivePre = ctx.createBiquadFilter();
      guitarDrivePre.type = 'highpass';
      guitarDrivePre.frequency.setValueAtTime(115, ctx.currentTime);
      guitarDrivePre.Q.setValueAtTime(0.8, ctx.currentTime);

      const guitarShaper = ctx.createWaveShaper();
      guitarShaper.curve = makeDistortionCurve(28);
      guitarShaper.oversample = '2x';

      const guitarMidBoost = ctx.createBiquadFilter();
      guitarMidBoost.type = 'peaking';
      guitarMidBoost.frequency.setValueAtTime(2100, ctx.currentTime);
      guitarMidBoost.gain.setValueAtTime(3.8, ctx.currentTime);
      guitarMidBoost.Q.setValueAtTime(1.2, ctx.currentTime);

      const guitarCabLp = ctx.createBiquadFilter();
      guitarCabLp.type = 'lowpass';
      guitarCabLp.frequency.setValueAtTime(3500, ctx.currentTime);
      guitarCabLp.Q.setValueAtTime(0.85, ctx.currentTime);

      const guitarBusGain = ctx.createGain();
      guitarBusGain.gain.setValueAtTime(audioState.targetGuitarGain, ctx.currentTime);

      guitarDrivePre.connect(guitarShaper);
      guitarShaper.connect(guitarMidBoost);
      guitarMidBoost.connect(guitarCabLp);
      guitarCabLp.connect(guitarBusGain);
      guitarBusGain.connect(compressor);

      // Picked Bass & Stage Drum Buses
      const bassBusGain = ctx.createGain();
      bassBusGain.gain.setValueAtTime(0.92, ctx.currentTime);
      bassBusGain.connect(compressor);

      const drumBusGain = ctx.createGain();
      drumBusGain.gain.setValueAtTime(1.0, ctx.currentTime);
      drumBusGain.connect(compressor);

      // Streamed Background Track Mastering Bus (Lowshelf -> MidPeak -> HighCut -> TrackGain)
      const trackLowShelf = ctx.createBiquadFilter();
      trackLowShelf.type = 'lowshelf';
      trackLowShelf.frequency.setValueAtTime(90, ctx.currentTime);
      trackLowShelf.gain.setValueAtTime(2.5, ctx.currentTime);

      const trackMidPeak = ctx.createBiquadFilter();
      trackMidPeak.type = 'peaking';
      trackMidPeak.frequency.setValueAtTime(2400, ctx.currentTime);
      trackMidPeak.Q.setValueAtTime(1.1, ctx.currentTime);
      trackMidPeak.gain.setValueAtTime(2.0, ctx.currentTime);

      const trackHighCut = ctx.createBiquadFilter();
      trackHighCut.type = 'lowpass';
      trackHighCut.frequency.setValueAtTime(16500, ctx.currentTime);
      trackHighCut.Q.setValueAtTime(0.75, ctx.currentTime);

      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(0.95, ctx.currentTime);

      trackLowShelf.connect(trackMidPeak);
      trackMidPeak.connect(trackHighCut);
      trackHighCut.connect(trackGain);
      trackGain.connect(compressor);

      // Subtle continuous Drop-D room floor behind the live band
      const ambientFilter = ctx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.setValueAtTime(audioState.targetFilterFreq, ctx.currentTime);
      ambientFilter.Q.setValueAtTime(1.6, ctx.currentTime);

      const ambientGain = ctx.createGain();
      ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);

      ambientFilter.connect(ambientGain);
      ambientGain.connect(compressor);

      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(36.71, ctx.currentTime);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.32, ctx.currentTime);
      subOsc.connect(subGain);
      subGain.connect(ambientFilter);

      const warmOsc = ctx.createOscillator();
      warmOsc.type = 'triangle';
      warmOsc.frequency.setValueAtTime(73.42, ctx.currentTime);
      warmOsc.detune.setValueAtTime(-5, ctx.currentTime);
      const warmGain = ctx.createGain();
      warmGain.gain.setValueAtTime(0.18, ctx.currentTime);
      warmOsc.connect(warmGain);
      warmGain.connect(ambientFilter);

      const lfoOsc = ctx.createOscillator();
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(0.12, ctx.currentTime);
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.setValueAtTime(24, ctx.currentTime);
      lfoOsc.connect(lfoDepth);
      lfoDepth.connect(ambientFilter.frequency);

      const noiseBuffer = buildNoiseBuffer(ctx, 2.5);
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      noiseSrc.loop = true;
      const noiseBp = ctx.createBiquadFilter();
      noiseBp.type = 'bandpass';
      noiseBp.frequency.setValueAtTime(950, ctx.currentTime);
      noiseBp.Q.setValueAtTime(0.9, ctx.currentTime);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.012, ctx.currentTime);
      noiseSrc.connect(noiseBp);
      noiseBp.connect(noiseGain);
      noiseGain.connect(ambientFilter);

      subOsc.start();
      warmOsc.start();
      lfoOsc.start();
      noiseSrc.start();

      audioState.ctx = ctx;
      audioState.compressor = compressor;
      audioState.masterGain = masterGain;
      audioState.analyser = analyser;
      audioState.freqData = freqData;
      audioState.ambientFilter = ambientFilter;
      audioState.ambientGain = ambientGain;
      audioState.guitarInput = guitarDrivePre;
      audioState.guitarBusGain = guitarBusGain;
      audioState.bassBusGain = bassBusGain;
      audioState.drumBusGain = drumBusGain;
      audioState.trackLowShelf = trackLowShelf;
      audioState.trackMidPeak = trackMidPeak;
      audioState.trackHighCut = trackHighCut;
      audioState.trackGain = trackGain;
      audioState.noiseBuffer = noiseBuffer;
      audioState.initialized = true;

      ensureTrackElement();
      connectTrackToContextIfRunning();
      applyTrackMastering();

      if (ctx.state === 'suspended') {
        ctx.resume()
          .then(() => {
            connectTrackToContextIfRunning();
          })
          .catch(() => {});
      }
      return ctx;
    };

    const triggerStageKick = (ctx, now, peak = 0.26, startHz = 148, endHz = 36.71) => {
      const dest = audioState.drumBusGain || audioState.compressor;
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + 0.13);

      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(220, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.26);

      // Beater click so kick punches through laptop/mobile speakers
      const click = ctx.createOscillator();
      const clickGain = ctx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(2500, now);
      click.frequency.exponentialRampToValueAtTime(420, now + 0.016);
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.linearRampToValueAtTime(peak * 0.24, now + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      click.connect(clickGain);
      clickGain.connect(dest);
      click.start(now);
      click.stop(now + 0.025);
    };

    const triggerStageSnare = (ctx, now, ghost = false, peak = 0.16) => {
      const dest = audioState.drumBusGain || audioState.compressor;
      const scale = ghost ? 0.42 : 1;

      if (audioState.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = audioState.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1150, now);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2200, now);
        bp.Q.setValueAtTime(0.9, now);

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.linearRampToValueAtTime(peak * scale, now + 0.004);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + (ghost ? 0.08 : 0.165));

        noise.connect(hp);
        hp.connect(bp);
        bp.connect(nGain);
        nGain.connect(dest);
        noise.start(now, Math.random() * 0.9, 0.18);
      }

      [195, 330].forEach((startHz, idx) => {
        const body = ctx.createOscillator();
        const bGain = ctx.createGain();
        body.type = idx === 0 ? 'triangle' : 'sine';
        body.frequency.setValueAtTime(startHz, now);
        body.frequency.exponentialRampToValueAtTime(startHz * 0.56, now + 0.065);
        bGain.gain.setValueAtTime(0.0001, now);
        bGain.gain.linearRampToValueAtTime(peak * (idx === 0 ? 0.62 : 0.34) * scale, now + 0.003);
        bGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        body.connect(bGain);
        bGain.connect(dest);
        body.start(now);
        body.stop(now + 0.1);
      });
    };

    const triggerStageHat = (ctx, now, isOpen = false, level = 0.052) => {
      if (!audioState.noiseBuffer) return;
      const dest = audioState.drumBusGain || audioState.compressor;
      const noise = ctx.createBufferSource();
      noise.buffer = audioState.noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(5600, now);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isOpen ? 6800 : 8000, now);
      bp.Q.setValueAtTime(1.1, now);

      const gain = ctx.createGain();
      const dur = isOpen ? 0.175 : 0.036;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(isOpen ? level * 1.2 : level, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      noise.connect(hp);
      hp.connect(bp);
      bp.connect(gain);
      gain.connect(dest);
      noise.start(now, Math.random() * 1.1, dur + 0.02);
    };

    const triggerStageCrash = (ctx, now, level = 0.075) => {
      if (!audioState.noiseBuffer) return;
      const dest = audioState.drumBusGain || audioState.compressor;
      const noise = ctx.createBufferSource();
      noise.buffer = audioState.noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(4200, now);

      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.setValueAtTime(6400, now);
      peak.gain.setValueAtTime(3.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);

      noise.connect(hp);
      hp.connect(peak);
      peak.connect(gain);
      gain.connect(dest);
      noise.start(now, Math.random() * 0.7, 0.58);
    };

    const triggerPickedBass = (ctx, now, freq = 36.71, dur = 0.22, level = 0.17) => {
      const dest = audioState.bassBusGain || audioState.compressor;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(840, now);
      filter.frequency.exponentialRampToValueAtTime(155, now + Math.min(0.18, dur * 0.78));
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      filter.connect(gain);
      gain.connect(dest);

      [
        { type: 'sine', mult: 1, mix: 0.72 },
        { type: 'sawtooth', mult: 1, mix: 0.34 },
      ].forEach(({ type, mult, mix }) => {
        const osc = ctx.createOscillator();
        const oGain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * mult, now);
        oGain.gain.setValueAtTime(mix, now);
        osc.connect(oGain);
        oGain.connect(filter);
        osc.start(now);
        osc.stop(now + dur + 0.02);
      });
    };

    const triggerPowerChord = (ctx, now, rootHz = 73.42, dur = 0.24, mute = false, level = 0.15) => {
      const dest = audioState.guitarInput || audioState.compressor;
      const envDur = mute ? Math.min(0.095, dur) : dur;
      const attack = mute ? 0.004 : 0.008;

      const mix = ctx.createGain();
      mix.gain.setValueAtTime(0.0001, now);
      mix.gain.linearRampToValueAtTime(mute ? level * 1.12 : level, now + attack);
      mix.gain.exponentialRampToValueAtTime(0.0001, now + envDur);
      mix.connect(dest);

      const intervals = [
        { ratio: 1.0, detune: -6, type: 'sawtooth' },
        { ratio: 1.498, detune: 5, type: 'sawtooth' },
        { ratio: 2.0, detune: -3, type: 'triangle' },
      ];
      intervals.forEach(({ ratio, detune, type }) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(rootHz * ratio, now);
        osc.detune.setValueAtTime(detune, now);
        osc.connect(mix);
        osc.start(now);
        osc.stop(now + envDur + 0.025);
      });
    };

    const triggerLeadNote = (ctx, now, freq = 293.66, dur = 0.24, level = 0.1) => {
      const dest = audioState.guitarInput || audioState.compressor;
      const playAt = (startTime, peak, len) => {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peak, startTime + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + len);
        gain.connect(dest);

        ['sawtooth', 'triangle'].forEach((type, i) => {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, startTime);
          osc.detune.setValueAtTime(i === 0 ? -4 : 6, startTime);
          osc.connect(gain);
          osc.start(startTime);
          osc.stop(startTime + len + 0.02);
        });
      };

      playAt(now, level, dur);
      playAt(now + 0.135, level * 0.36, dur * 0.85);
    };

    const triggerAmbientPadSwell = (ctx, now) => {
      const chord = [146.83, 220.0, 261.63, 329.63];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, now);
      filter.frequency.linearRampToValueAtTime(620, now + 0.85);
      filter.frequency.exponentialRampToValueAtTime(240, now + 2.2);

      const mix = ctx.createGain();
      mix.gain.setValueAtTime(0.0001, now);
      mix.gain.linearRampToValueAtTime(0.045, now + 0.45);
      mix.gain.exponentialRampToValueAtTime(0.0001, now + 2.25);

      filter.connect(mix);
      mix.connect(audioState.compressor);

      chord.forEach((hz, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(hz, now);
        osc.detune.setValueAtTime((idx - 1.5) * 4, now);
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + 2.3);
      });
    };

    // 32-step (2-bar) underground full-band sequencer patterns (Drop-D tuning)
    const BAND_PATTERNS = {
      industrial: {
        // RIFF 117 — 117 BPM driving alt-rock / underground Drop-D groove
        kicks: new Set([0, 3, 8, 10, 14, 16, 19, 24, 26, 27]),
        snares: new Set([4, 12, 20, 28, 31]),
        ghostSnares: new Set([7, 15, 30]),
        openHats: new Set([6, 14, 22, 30]),
        closedHatMod: 2,
        crashes: new Set([0]),
        swells: new Set(),
        bass: {
          0: [36.71, 0.22], 2: [36.71, 0.12], 3: [36.71, 0.12], 4: [73.42, 0.2], 6: [36.71, 0.14],
          8: [43.65, 0.22], 10: [43.65, 0.12], 11: [49.0, 0.18], 12: [36.71, 0.24], 14: [65.41, 0.14],
          16: [36.71, 0.22], 18: [36.71, 0.12], 19: [36.71, 0.12], 20: [58.27, 0.22], 22: [58.27, 0.12],
          24: [65.41, 0.2], 26: [55.0, 0.2], 28: [49.0, 0.26], 30: [55.0, 0.14], 31: [65.41, 0.12],
        },
        guitar: {
          0: [73.42, 0.24, false], 2: [73.42, 0.09, true], 3: [73.42, 0.09, true], 4: [73.42, 0.2, false],
          6: [73.42, 0.09, true], 8: [87.31, 0.22, false], 10: [87.31, 0.09, true], 11: [98.0, 0.18, false],
          12: [73.42, 0.25, false], 14: [130.81, 0.09, true], 15: [73.42, 0.09, true],
          16: [73.42, 0.24, false], 18: [73.42, 0.09, true], 19: [73.42, 0.09, true], 20: [116.54, 0.22, false],
          22: [116.54, 0.09, true], 24: [130.81, 0.2, false], 26: [110.0, 0.2, false],
          28: [98.0, 0.28, false], 30: [110.0, 0.09, true], 31: [130.81, 0.09, true],
        },
        lead: {
          8: [349.23, 0.22], 12: [293.66, 0.24], 16: [440.0, 0.24], 20: [466.16, 0.22],
          24: [523.25, 0.24], 28: [440.0, 0.26],
        },
      },
      drone: {
        // PUNK 142 — 142 BPM upbeat garage / skate-punk pit energy
        kicks: new Set([0, 2, 6, 8, 10, 14, 16, 18, 22, 24, 26, 30]),
        snares: new Set([4, 12, 20, 28, 31]),
        ghostSnares: new Set([29]),
        openHats: new Set([14, 30]),
        closedHatMod: 2,
        crashes: new Set([0, 16]),
        swells: new Set(),
        bass: {
          0: [36.71, 0.16], 2: [36.71, 0.14], 4: [36.71, 0.16], 6: [36.71, 0.14],
          8: [58.27, 0.16], 10: [58.27, 0.14], 12: [58.27, 0.16], 14: [58.27, 0.14],
          16: [43.65, 0.16], 18: [43.65, 0.14], 20: [43.65, 0.16], 22: [43.65, 0.14],
          24: [65.41, 0.16], 26: [65.41, 0.14], 28: [55.0, 0.18], 30: [55.0, 0.14],
        },
        guitar: {
          0: [73.42, 0.18, false], 2: [73.42, 0.08, true], 4: [73.42, 0.16, false], 6: [73.42, 0.08, true],
          8: [116.54, 0.18, false], 10: [116.54, 0.08, true], 12: [116.54, 0.16, false], 14: [116.54, 0.08, true],
          16: [87.31, 0.18, false], 18: [87.31, 0.08, true], 20: [87.31, 0.16, false], 22: [87.31, 0.08, true],
          24: [130.81, 0.18, false], 26: [130.81, 0.08, true], 28: [110.0, 0.2, false], 30: [110.0, 0.14, false],
        },
        lead: {
          0: [587.33, 0.18], 8: [466.16, 0.18], 16: [523.25, 0.18], 24: [587.33, 0.2], 28: [440.0, 0.22],
        },
      },
      swell: {
        // INTRO 92 — 92 BPM heavy shoegaze / stoner doom stage opener
        kicks: new Set([0, 6, 10, 16, 22, 26]),
        snares: new Set([8, 24]),
        ghostSnares: new Set([30]),
        openHats: new Set([4, 12, 20, 28]),
        closedHatMod: 4,
        crashes: new Set([0, 16]),
        swells: new Set([0]),
        bass: {
          0: [36.71, 0.52], 6: [36.71, 0.24], 8: [43.65, 0.5], 14: [49.0, 0.22],
          16: [58.27, 0.52], 22: [58.27, 0.24], 24: [49.0, 0.42], 28: [55.0, 0.36],
        },
        guitar: {
          0: [73.42, 0.55, false], 6: [73.42, 0.1, true], 8: [87.31, 0.52, false],
          16: [116.54, 0.55, false], 22: [116.54, 0.1, true], 24: [98.0, 0.44, false], 28: [110.0, 0.42, false],
        },
        lead: {
          0: [293.66, 0.42], 8: [349.23, 0.42], 16: [523.25, 0.42], 24: [440.0, 0.46],
        },
      },
    };

    const stepGrooveLoop = () => {
      if (!canSynthesize() || audioState.ctx.state !== 'running') return;
      const ctx = audioState.ctx;
      const now = ctx.currentTime;
      const step = audioState.stepIndex % 32;
      audioState.stepIndex = (audioState.stepIndex + 1) % 32;

      const p = BAND_PATTERNS[audioState.preset] || BAND_PATTERNS.industrial;
      if (p.crashes.has(step)) triggerStageCrash(ctx, now);
      if (p.swells.has(step)) triggerAmbientPadSwell(ctx, now);
      if (p.kicks.has(step)) triggerStageKick(ctx, now);
      if (p.snares.has(step)) triggerStageSnare(ctx, now, false);
      else if (p.ghostSnares.has(step)) triggerStageSnare(ctx, now, true);

      if (p.openHats.has(step)) triggerStageHat(ctx, now, true);
      else if (step % p.closedHatMod === 0) triggerStageHat(ctx, now, false);

      const bassHit = p.bass[step];
      if (bassHit) triggerPickedBass(ctx, now, bassHit[0], bassHit[1]);

      const chordHit = p.guitar[step];
      if (chordHit) triggerPowerChord(ctx, now, chordHit[0], chordHit[1], chordHit[2]);

      const leadHit = p.lead[step];
      if (leadHit) triggerLeadNote(ctx, now, leadHit[0], leadHit[1]);
    };

    const duckAmbience = (durationSec = 0.22) => {
      if (!audioState.enabled || !audioState.ctx || !audioState.ambientGain) return;
      const now = audioState.ctx.currentTime;
      const gainParam = audioState.ambientGain.gain;
      const target = getActiveRoomGain();
      gainParam.cancelScheduledValues(now);
      gainParam.setTargetAtTime(Math.max(0.001, target * 0.42), now, 0.018);
      gainParam.setTargetAtTime(target, now + 0.08, Math.max(0.06, durationSec * 0.45));
    };

    const updateSectionAmbience = (sectionId) => {
      audioState.currentSectionId = sectionId || 'home';
      if (sectionId === 'transparansi-preview' || sectionId === 'transparansi') {
        audioState.targetFilterFreq = 110;
        audioState.targetAmbientGain = 0.015;
        audioState.targetGuitarGain = 0.42;
        audioState.sectionTrackMult = 0.62;
        audioState.sectionHighCapHz = 1350;
      } else if (sectionId === 'home' || sectionId === 'lineup' || sectionId === 'venue') {
        audioState.targetFilterFreq = 165;
        audioState.targetAmbientGain = 0.024;
        audioState.targetGuitarGain = 0.78;
        audioState.sectionTrackMult = 1.0;
        audioState.sectionHighCapHz = 18000;
      } else {
        audioState.targetFilterFreq = 140;
        audioState.targetAmbientGain = 0.019;
        audioState.targetGuitarGain = 0.62;
        audioState.sectionTrackMult = 0.85;
        audioState.sectionHighCapHz = 16500;
      }

      if (!audioState.enabled || !audioState.ctx || !audioState.ambientFilter || !audioState.ambientGain) return;
      const now = audioState.ctx.currentTime;
      audioState.ambientFilter.frequency.setTargetAtTime(audioState.targetFilterFreq, now, 0.25);
      audioState.ambientGain.gain.setTargetAtTime(getActiveRoomGain(), now, 0.25);
      audioState.guitarBusGain?.gain.setTargetAtTime(audioState.targetGuitarGain, now, 0.25);
      applyTrackMastering();
    };

    const playHoverTick = () => {
      if (!canPlaySfx()) return;
      const nowMs = performance.now();
      if (nowMs - audioState.lastHoverAt < 65) return;
      audioState.lastHoverAt = nowMs;

      const ctx = audioState.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1650, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.016);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(1.6, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.028, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioState.compressor);

      osc.start(now);
      osc.stop(now + 0.022);
    };

    const playNavSwitch = () => {
      if (!canPlaySfx()) return;
      const ctx = audioState.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      duckAmbience(0.18);

      const osc = ctx.createOscillator();
      const clickOsc = ctx.createOscillator();
      const gain = ctx.createGain();
      const clickGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.045);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);

      clickOsc.type = 'sine';
      clickOsc.frequency.setValueAtTime(1850, now);
      clickOsc.frequency.exponentialRampToValueAtTime(760, now + 0.014);
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.linearRampToValueAtTime(0.032, now + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);

      osc.connect(gain);
      clickOsc.connect(clickGain);
      gain.connect(audioState.compressor);
      clickGain.connect(audioState.compressor);

      osc.start(now);
      osc.stop(now + 0.058);
      clickOsc.start(now);
      clickOsc.stop(now + 0.02);
    };

    const playCtaHit = () => {
      if (!canPlaySfx()) return;
      const ctx = audioState.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      duckAmbience(0.28);

      const subOsc = ctx.createOscillator();
      const fifthOsc = ctx.createOscillator();
      const punchGain = ctx.createGain();
      const overtoneGain = ctx.createGain();

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(146.83, now);
      subOsc.frequency.exponentialRampToValueAtTime(73.42, now + 0.088);

      punchGain.gain.setValueAtTime(0.0001, now);
      punchGain.gain.linearRampToValueAtTime(0.11, now + 0.005);
      punchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

      fifthOsc.type = 'triangle';
      fifthOsc.frequency.setValueAtTime(220.0, now);
      fifthOsc.frequency.exponentialRampToValueAtTime(110.0, now + 0.075);

      overtoneGain.gain.setValueAtTime(0.0001, now);
      overtoneGain.gain.linearRampToValueAtTime(0.048, now + 0.004);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.082);

      subOsc.connect(punchGain);
      fifthOsc.connect(overtoneGain);
      punchGain.connect(audioState.compressor);
      overtoneGain.connect(audioState.compressor);

      subOsc.start(now);
      subOsc.stop(now + 0.1);
      fifthOsc.start(now);
      fifthOsc.stop(now + 0.09);
    };

    const playOverlayWhoosh = (isOpen = true) => {
      if (!canPlaySfx()) return;
      const ctx = audioState.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      duckAmbience(0.2);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isOpen ? 240 : 500, now);
      osc.frequency.exponentialRampToValueAtTime(isOpen ? 520 : 210, now + 0.105);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.058, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.112);

      osc.connect(gain);
      gain.connect(audioState.compressor);
      osc.start(now);
      osc.stop(now + 0.12);

      if (audioState.noiseBuffer) {
        const noise = ctx.createBufferSource();
        const bp = ctx.createBiquadFilter();
        const nGain = ctx.createGain();
        noise.buffer = audioState.noiseBuffer;

        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(isOpen ? 480 : 1200, now);
        bp.frequency.exponentialRampToValueAtTime(isOpen ? 1400 : 420, now + 0.1);
        bp.Q.setValueAtTime(1.4, now);

        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.linearRampToValueAtTime(0.036, now + 0.018);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

        noise.connect(bp);
        bp.connect(nGain);
        nGain.connect(audioState.compressor);
        noise.start(now, Math.random() * 1.1, 0.12);
      }
    };

    const playSoundCheck = () => {
      if (!audioState.enabled) {
        setAudioEnabled(true, false);
      }
      if (!audioState.ctx) return;
      const ctx = audioState.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      duckAmbience(0.45);
      triggerStageKick(ctx, now, 0.28);
      triggerStageSnare(ctx, now, false, 0.16);
      triggerStageCrash(ctx, now, 0.09);
      triggerPickedBass(ctx, now, 36.71, 0.42, 0.2);
      triggerPowerChord(ctx, now, 73.42, 0.48, false, 0.17);
      triggerLeadNote(ctx, now + 0.08, 293.66, 0.3, 0.11);
    };

    const updateEqBars = () => {
      const desktopBtn = document.getElementById('btnAudioToggle');
      const mobileBtn = document.getElementById('btnMobileAudioToggle');
      const buttons = [desktopBtn, mobileBtn].filter(Boolean);

      if (!canSynthesize() || !audioState.analyser || !audioState.freqData) {
        buttons.forEach((btn) => btn.classList.remove('has-live-analyser'));
        return;
      }

      audioState.analyser.getByteFrequencyData(audioState.freqData);
      const d = audioState.freqData;
      const bins = [
        (d[0] + (d[1] || 0)) / 510,
        (d[2] + (d[3] || 0) + (d[4] || 0) + (d[5] || 0)) / 1020,
        ((d[6] || 0) + (d[8] || 0) + (d[10] || 0) + (d[12] || 0)) / 1020,
        ((d[14] || 0) + (d[18] || 0) + (d[22] || 0) + (d[26] || 0)) / 1020,
      ];

      buttons.forEach((btn) => {
        btn.classList.add('has-live-analyser');
        bins.forEach((val, idx) => {
          const scaled = Math.max(0.24, Math.min(1, 0.24 + val * 1.15));
          btn.style.setProperty(`--eq-${idx + 1}`, scaled.toFixed(2));
        });
      });
    };

    // Paket 1 + Sultan 24-Bar Console Peak-Hold & Segmented LED Spectrum
    const heroEl = document.getElementById('home');
    const spectrumWrap = document.getElementById('heroSultanSpectrum');
    const SPEC_BINS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 21, 23, 25, 28, 31, 34, 38, 42];
    let specBars = [];
    let specCaps = [];
    const barLvls = new Float32Array(SPEC_BINS.length).fill(0.04);
    const capLvls = new Float32Array(SPEC_BINS.length).fill(0.04);
    const capVel = new Float32Array(SPEC_BINS.length);

    if (spectrumWrap) {
      if (!spectrumWrap.querySelector('.gigs-spec-col')) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < SPEC_BINS.length; i++) {
          const col = document.createElement('span');
          col.className = 'gigs-spec-col';
          const bar = document.createElement('span');
          bar.className = 'gigs-spec-bar';
          const cap = document.createElement('span');
          cap.className = 'gigs-spec-cap';
          col.append(bar, cap);
          frag.appendChild(col);
        }
        spectrumWrap.appendChild(frag);
      }
      specBars = Array.from(spectrumWrap.querySelectorAll('.gigs-spec-bar'));
      specCaps = Array.from(spectrumWrap.querySelectorAll('.gigs-spec-cap'));
    }

    let heroStageVisible = true;
    let heroReactiveRaf = 0;
    let bassAvg = 0.25;
    let bassSmooth = 0;
    let highSmooth = 0;
    let beatPulse = 0;

    const resetHeroAudioVars = () => {
      if (!heroEl) return;
      heroEl.classList.remove('has-audio-reactive');
      heroEl.style.removeProperty('--audio-bass');
      heroEl.style.removeProperty('--audio-high');
      heroEl.style.removeProperty('--audio-beat');
      for (let i = 0; i < specBars.length; i++) {
        barLvls[i] = 0.04;
        capLvls[i] = 0.04;
        capVel[i] = 0;
        specBars[i].style.setProperty('--lvl', '0.04');
        specCaps[i].style.setProperty('--cap', '0.04');
      }
    };

    const stopHeroReactiveLoop = () => {
      if (heroReactiveRaf) {
        cancelAnimationFrame(heroReactiveRaf);
        heroReactiveRaf = 0;
      }
      resetHeroAudioVars();
    };

    const tickHeroReactive = () => {
      heroReactiveRaf = 0;
      const trackReady = audioState.trackFailed || Boolean(audioState.trackEl && !audioState.trackEl.paused);
      if (
        !heroEl ||
        !heroStageVisible ||
        !isMotionEnabled() ||
        !canSynthesize() ||
        !audioState.analyser ||
        !audioState.freqData ||
        audioState.ctx?.state !== 'running' ||
        !trackReady
      ) {
        resetHeroAudioVars();
        return;
      }

      audioState.analyser.getByteFrequencyData(audioState.freqData);
      const d = audioState.freqData;
      const bassRaw = (d[0] * 0.6 + (d[1] || 0) * 0.4) / 255;
      const highRaw = ((d[12] || 0) + (d[14] || 0) + (d[16] || 0) + (d[18] || 0)) / 1020;

      bassAvg = bassAvg * 0.92 + bassRaw * 0.08;
      if (bassRaw - bassAvg > 0.075 && bassRaw > 0.3) {
        beatPulse = 1;
      } else {
        beatPulse *= 0.86;
        if (beatPulse < 0.01) beatPulse = 0;
      }

      bassSmooth += (Math.min(1, bassRaw * 1.15) - bassSmooth) * 0.34;
      highSmooth += (Math.min(1, highRaw * 1.35) - highSmooth) * 0.26;

      heroEl.classList.add('has-audio-reactive');
      heroEl.style.setProperty('--audio-bass', bassSmooth.toFixed(3));
      heroEl.style.setProperty('--audio-high', highSmooth.toFixed(3));
      heroEl.style.setProperty('--audio-beat', beatPulse.toFixed(3));

      for (let i = 0; i < specBars.length; i++) {
        const raw = (d[SPEC_BINS[i]] || 0) / 255;
        const target = Math.max(0.05, Math.min(1, raw * (1 + i * 0.022)));
        const nextLvl = barLvls[i] + (target - barLvls[i]) * 0.44;
        barLvls[i] = nextLvl;

        if (nextLvl >= capLvls[i]) {
          capLvls[i] = nextLvl;
          capVel[i] = 0;
        } else {
          capVel[i] += 0.0022;
          capLvls[i] = Math.max(nextLvl, capLvls[i] - capVel[i]);
        }

        specBars[i].style.setProperty('--lvl', nextLvl.toFixed(3));
        specCaps[i].style.setProperty('--cap', capLvls[i].toFixed(3));
      }

      heroReactiveRaf = requestAnimationFrame(tickHeroReactive);
    };

    const startHeroReactiveLoop = () => {
      if (!heroEl || !heroStageVisible || !isMotionEnabled() || !canSynthesize()) return;
      if (!heroReactiveRaf) {
        heroReactiveRaf = requestAnimationFrame(tickHeroReactive);
      }
    };

    if (heroEl && 'IntersectionObserver' in window) {
      const heroIo = new IntersectionObserver(
        (entries) => {
          heroStageVisible = Boolean(entries[0]?.isIntersecting);
          if (!heroStageVisible) {
            stopHeroReactiveLoop();
          } else if (canSynthesize()) {
            startHeroReactiveLoop();
          }
        },
        { threshold: 0.02 }
      );
      heroIo.observe(heroEl);
    }

    const syncMixerUi = () => {
      const popoverStatus = document.getElementById('audioPopoverStatus');
      const volInput = document.getElementById('audioVolumeRange');
      const volVal = document.getElementById('audioVolumeValue');
      const sfxBtn = document.getElementById('btnAudioSfxToggle');

      if (popoverStatus) {
        popoverStatus.textContent = audioState.enabled ? 'LIVE' : audioState.autoArmed ? 'ARMED' : 'MUTED';
        popoverStatus.classList.toggle('is-live', audioState.enabled);
      }

      document.querySelectorAll('[data-audio-preset]').forEach((btn) => {
        const isMatch = btn.dataset.audioPreset === audioState.preset;
        btn.classList.toggle('is-active', isMatch);
        btn.setAttribute('aria-pressed', String(isMatch));
      });

      const pct = Math.round(audioState.volume * 100);
      if (volInput && Number(volInput.value) !== pct) {
        volInput.value = String(pct);
      }
      if (volVal) {
        volVal.textContent = `${pct}%`;
      }
      if (sfxBtn) {
        sfxBtn.classList.toggle('is-on', audioState.sfxEnabled);
        sfxBtn.setAttribute('aria-pressed', String(audioState.sfxEnabled));
        const span = sfxBtn.querySelector('span');
        if (span) span.textContent = audioState.sfxEnabled ? 'UI SFX: ON' : 'UI SFX: OFF';
      }
    };

    const syncToggleButtons = () => {
      const desktopBtn = document.getElementById('btnAudioToggle');
      const mobileBtn = document.getElementById('btnMobileAudioToggle');
      const desktopLabel = document.getElementById('audioToggleLabel');
      const mobileLabel = document.getElementById('mobileAudioToggleLabel');

      [desktopBtn, mobileBtn].forEach((btn) => {
        if (!btn) return;
        btn.classList.toggle('is-playing', audioState.enabled);
        btn.classList.toggle('is-armed', !audioState.enabled && audioState.autoArmed);
        btn.setAttribute('aria-pressed', String(audioState.enabled));
      });

      if (desktopLabel) {
        desktopLabel.textContent = audioState.enabled ? 'SOUND ON' : audioState.autoArmed ? 'SOUND READY' : 'SOUND OFF';
      }
      if (mobileLabel) {
        mobileLabel.textContent = audioState.enabled
          ? 'STAGE SOUND: ON'
          : audioState.autoArmed
            ? 'STAGE SOUND: READY'
            : 'STAGE SOUND: OFF';
      }
      syncMixerUi();
    };

    const bindAutoplayResume = () => {
      if (audioState.resumeUnlockerBound) return;
      const events = ['pointerdown', 'touchstart', 'keydown', 'click'];
      const detach = () => {
        if (!audioState.resumeUnlockerBound) return;
        events.forEach((evt) => document.removeEventListener(evt, resumeBlockedContext, true));
        audioState.resumeUnlockerBound = false;
        audioState.detachResumeUnlocker = null;
      };
      const tryDetachIfUnlocked = () => {
        const trackReady = audioState.trackFailed || !audioState.trackEl || !audioState.trackEl.paused;
        if (trackReady) {
          audioState.blockedByAutoplay = false;
          connectTrackToContextIfRunning();
          detach();
          updateEqBars();
          startHeroReactiveLoop();
        }
      };
      function resumeBlockedContext() {
        if (!audioState.enabled) {
          detach();
          return;
        }
        const tasks = [];
        if (audioState.ctx && audioState.ctx.state === 'suspended') {
          tasks.push(audioState.ctx.resume().catch(() => {}));
        }
        if (!audioState.trackFailed && audioState.trackEl && audioState.trackEl.paused && !audioState.compatLoading) {
          const playPromise = audioState.trackEl.play();
          if (playPromise && typeof playPromise.then === 'function') {
            tasks.push(playPromise.catch(() => {}));
          }
        }
        if (tasks.length === 0) {
          tryDetachIfUnlocked();
          return;
        }
        Promise.all(tasks).then(() => {
          connectTrackToContextIfRunning();
          if (audioState.trackFailed && audioState.ctx?.state === 'running') {
            stepGrooveLoop();
          }
          tryDetachIfUnlocked();
        });
      }
      events.forEach((evt) => document.addEventListener(evt, resumeBlockedContext, { capture: true, passive: true }));
      audioState.resumeUnlockerBound = true;
      audioState.detachResumeUnlocker = detach;
    };

    const startStageLoops = () => {
      if (audioState.grooveTimer) {
        clearInterval(audioState.grooveTimer);
        audioState.grooveTimer = null;
      }
      if (audioState.analyserTimer) clearInterval(audioState.analyserTimer);

      if (!audioState.trackFailed) {
        const track = ensureTrackElement();
        track.preload = 'auto';
        applyTrackMastering();
        if (!audioState.compatLoading) {
          const playPromise = track.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise
              .then(() => {
                audioState.blockedByAutoplay = false;
                connectTrackToContextIfRunning();
                startHeroReactiveLoop();
              })
              .catch(() => {
                audioState.blockedByAutoplay = true;
                bindAutoplayResume();
              });
          }
        }
      } else {
        audioState.stepIndex = 0;
        const stepMs = PRESET_STEP_MS[audioState.preset] || 128;
        stepGrooveLoop();
        audioState.grooveTimer = window.setInterval(stepGrooveLoop, stepMs);
        startHeroReactiveLoop();
      }

      audioState.analyserTimer = window.setInterval(updateEqBars, 90);
    };

    const stopStageLoops = () => {
      audioState.trackEl?.pause();
      if (audioState.grooveTimer) {
        clearInterval(audioState.grooveTimer);
        audioState.grooveTimer = null;
      }
      if (audioState.analyserTimer) {
        clearInterval(audioState.analyserTimer);
        audioState.analyserTimer = null;
      }
      stopHeroReactiveLoop();
      updateEqBars();
    };

    const setAudioEnabled = (nextEnabled, withFeedback = false) => {
      audioState.enabled = Boolean(nextEnabled);
      audioState.autoArmed = false;
      writeStoredPref(AUDIO_PREF_KEY, audioState.enabled ? '1' : '0');

      if (audioState.enabled) {
        const ctx = ensureContext();
        if (ctx && audioState.ambientGain && audioState.ambientFilter) {
          const now = ctx.currentTime;
          audioState.masterGain?.gain.setTargetAtTime(document.hidden ? 0.0001 : effectiveMasterGain(), now, 0.06);
          audioState.ambientFilter.frequency.setTargetAtTime(audioState.targetFilterFreq, now, 0.18);
          audioState.ambientGain.gain.cancelScheduledValues(now);
          audioState.ambientGain.gain.setTargetAtTime(getActiveRoomGain(), now, 0.18);
          audioState.guitarBusGain?.gain.setTargetAtTime(audioState.targetGuitarGain, now, 0.18);
          applyTrackMastering();
          if (ctx.state === 'suspended') {
            bindAutoplayResume();
          }
        }
        startStageLoops();
        if (withFeedback && audioState.sfxEnabled) playCtaHit();
      } else {
        audioState.detachResumeUnlocker?.();
        stopStageLoops();
        if (audioState.ctx && audioState.ambientGain) {
          const now = audioState.ctx.currentTime;
          audioState.ambientGain.gain.cancelScheduledValues(now);
          audioState.ambientGain.gain.setTargetAtTime(0.0001, now, 0.05);
        }
      }

      syncToggleButtons();
      return audioState.enabled;
    };

    const setPreset = (presetName) => {
      if (!VALID_PRESETS.has(presetName)) return audioState.preset;
      audioState.preset = presetName;
      writeStoredPref(AUDIO_PRESET_KEY, presetName);
      audioState.stepIndex = 0;
      if (!audioState.enabled) {
        setAudioEnabled(true, false);
      } else if (!audioState.trackFailed) {
        applyTrackMastering();
      } else {
        startStageLoops();
      }
      playNavSwitch();
      syncMixerUi();
      return audioState.preset;
    };

    const setVolume = (nextVol01) => {
      const clamped = Math.max(0, Math.min(1, Number(nextVol01) || 0));
      audioState.volume = clamped;
      writeStoredPref(AUDIO_VOL_KEY, Math.round(clamped * 100));
      if (clamped > 0 && !audioState.enabled) {
        setAudioEnabled(true, false);
      }
      applyTrackMastering();
      if (audioState.ctx && audioState.masterGain && !document.hidden) {
        audioState.masterGain.gain.setTargetAtTime(effectiveMasterGain(), audioState.ctx.currentTime, 0.04);
      }
      syncMixerUi();
      return audioState.volume;
    };

    const setMixerOpen = (nextOpen) => {
      const popover = document.getElementById('audioMixerPopover');
      const mixerBtn = document.getElementById('btnAudioMixerToggle');
      if (!popover || !mixerBtn) return;
      audioState.mixerOpen = Boolean(nextOpen);
      popover.hidden = !audioState.mixerOpen;
      mixerBtn.setAttribute('aria-expanded', String(audioState.mixerOpen));
      if (canPlaySfx()) playOverlayWhoosh(audioState.mixerOpen);
    };

    const toggleAudio = () => {
      if (audioState.enabled && !audioState.trackFailed && audioState.trackEl && audioState.trackEl.paused) {
        return setAudioEnabled(true, false);
      }
      return setAudioEnabled(!audioState.enabled, false);
    };

    document.getElementById('btnAudioToggle')?.addEventListener('click', toggleAudio);
    document.getElementById('btnMobileAudioToggle')?.addEventListener('click', toggleAudio);

    document.getElementById('btnAudioMixerToggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setMixerOpen(!audioState.mixerOpen);
    });

    document.querySelectorAll('[data-audio-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setPreset(btn.dataset.audioPreset);
      });
    });

    document.getElementById('audioVolumeRange')?.addEventListener('input', (e) => {
      setVolume(Number(e.target.value) / 100);
    });

    document.getElementById('btnAudioSfxToggle')?.addEventListener('click', () => {
      audioState.sfxEnabled = !audioState.sfxEnabled;
      writeStoredPref(AUDIO_SFX_KEY, audioState.sfxEnabled ? '1' : '0');
      syncMixerUi();
      if (audioState.sfxEnabled && audioState.enabled) playNavSwitch();
    });

    document.getElementById('btnAudioTestChord')?.addEventListener('click', playSoundCheck);

    // Subtle UI SFX hooks & outside-click close for mixer popover
    document.addEventListener(
      'pointerover',
      (e) => {
        if (!canPlaySfx()) return;
        const target = e.target.closest?.(
          '.gigs-nav-item, .gigs-sp-slot, .gigs-sp-benefit-pill, .gigs-lineup-card, .gigs-prog-card, .gigs-org-slice, .gigs-org-stage-tab, .gigs-mode-btn, .gigs-spring-btn'
        );
        if (!target) {
          audioState.lastHoverEl = null;
          return;
        }
        if (target === audioState.lastHoverEl) return;
        audioState.lastHoverEl = target;
        playHoverTick();
      },
      { passive: true }
    );

    document.addEventListener('click', (e) => {
      const el = e.target;
      if (audioState.mixerOpen && !el?.closest?.('#audioHudCluster')) {
        setMixerOpen(false);
      }

      if (!canPlaySfx() || !el || typeof el.closest !== 'function') return;
      if (el.closest('#audioHudCluster, #btnMobileAudioToggle')) return;

      if (el.closest('#btnOpenAuthModal, #btnMobileAuth, #btnMobileMenu, #btnTriggerModalFromSys')) {
        playOverlayWhoosh(true);
      } else if (el.closest('#btnCloseAuthModal, [data-close-modal], [data-close-drawer]')) {
        playOverlayWhoosh(false);
      } else if (
        el.closest(
          '.gigs-btn-primary, .gigs-btn-cream, .gigs-btn-outline, .gigs-sponsor-cta-card, .gigs-alliance-cta, .gigs-venue-btn'
        )
      ) {
        playCtaHit();
      } else if (
        el.closest('.gigs-nav-item, .gigs-drawer-nav button, [data-org-tab], [data-filter], [data-mode], .gigs-sp-slot')
      ) {
        playNavSwitch();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && audioState.mixerOpen) {
        setMixerOpen(false);
        document.getElementById('btnAudioMixerToggle')?.focus();
      }
    });

    // Section-reactive ambient cutoff modulation during scroll
    let sectionScrollRaf = 0;
    const checkScrollSection = () => {
      sectionScrollRaf = 0;
      if (state.screen && state.screen !== 'home') {
        updateSectionAmbience(state.screen);
        return;
      }
      const probeIds = ['transparansi-preview', 'venue', 'lineup', 'program', 'home'];
      const midY = (window.innerHeight || 900) * 0.48;
      let matched = 'home';
      for (const id of probeIds) {
        const sec = document.getElementById(id);
        if (!sec) continue;
        const rect = sec.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY * 0.4) {
          matched = id;
          break;
        }
      }
      if (matched !== audioState.currentSectionId) {
        updateSectionAmbience(matched);
      }
    };

    window.addEventListener(
      'scroll',
      () => {
        if (!sectionScrollRaf) sectionScrollRaf = requestAnimationFrame(checkScrollSection);
      },
      { passive: true }
    );

    document.addEventListener('visibilitychange', () => {
      if (!audioState.ctx || !audioState.masterGain) {
        if (document.hidden) audioState.trackEl?.pause();
        return;
      }
      const now = audioState.ctx.currentTime;
      if (document.hidden) {
        audioState.masterGain.gain.setTargetAtTime(0.0001, now, 0.04);
        audioState.trackEl?.pause();
        stopHeroReactiveLoop();
        if (audioState.analyserTimer) {
          clearInterval(audioState.analyserTimer);
          audioState.analyserTimer = null;
        }
      } else if (audioState.enabled) {
        if (audioState.ctx.state === 'suspended') {
          audioState.ctx.resume().then(() => startHeroReactiveLoop()).catch(() => {});
        }
        audioState.masterGain.gain.setTargetAtTime(effectiveMasterGain(), now, 0.08);
        if (!audioState.trackFailed && audioState.trackEl) {
          audioState.trackEl
            .play()
            .then(() => {
              connectTrackToContextIfRunning();
              startHeroReactiveLoop();
            })
            .catch(() => {
              bindAutoplayResume();
            });
        } else {
          startHeroReactiveLoop();
        }
        if (!audioState.analyserTimer) {
          audioState.analyserTimer = window.setInterval(updateEqBars, 90);
        }
      }
    });

    // Defer media creation/decoding until after first paint so initial render stays fast
    audioState.enabled = shouldAutoPlay;
    syncToggleButtons();

    if (shouldAutoPlay) {
      const kickOffBackgroundAudio = () => {
        if (audioState.enabled && !audioState.initialized) {
          setAudioEnabled(true, false);
        }
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.setTimeout(kickOffBackgroundAudio, 60));
      } else {
        window.setTimeout(kickOffBackgroundAudio, 60);
      }
    }

    window.__gigsAudio = {
      isEnabled: () => audioState.enabled,
      toggle: toggleAudio,
      setEnabled: setAudioEnabled,
      setPreset,
      setVolume,
      playHoverTick,
      playNavSwitch,
      playCtaHit,
      playOverlayWhoosh,
      playSoundCheck,
      getState: () => ({
        enabled: audioState.enabled,
        autoArmed: audioState.autoArmed,
        sfxEnabled: audioState.sfxEnabled,
        preset: audioState.preset,
        volumePct: Math.round(audioState.volume * 100),
        mixerOpen: audioState.mixerOpen,
        initialized: audioState.initialized,
        bandReady: Boolean(audioState.guitarInput && audioState.bassBusGain && audioState.drumBusGain),
        usingTrack: !audioState.trackFailed,
        blockedByAutoplay: audioState.blockedByAutoplay,
        heroReactive: Boolean(heroEl?.classList.contains('has-audio-reactive')),
        trackSrc: audioState.trackEl?.currentSrc || audioState.trackEl?.src || '',
        trackPaused: audioState.trackEl ? audioState.trackEl.paused : true,
        trackCurrentTime: audioState.trackEl ? Number(audioState.trackEl.currentTime.toFixed(2)) : 0,
        ctxState: audioState.ctx?.state || 'none',
        section: audioState.currentSectionId,
        cutoffHz: audioState.targetFilterFreq,
      }),
    };
  }

  function toggleAuditDock(forceState) {
    const dock = document.querySelector('.gigs-command-bar');
    if (!dock) return;
    const nextVisible = typeof forceState === 'boolean' ? forceState : dock.hidden;
    dock.hidden = !nextVisible;
    document.querySelectorAll('[data-screen="organizer"]').forEach((el) => {
      el.hidden = !nextVisible;
    });
  }

  function bindGlobalEvents() {
    // Navigation & screen links
    document.addEventListener('click', (e) => {
      const navTrigger = e.target.closest('[data-screen], [data-screen-link]');
      if (navTrigger) {
        if (navTrigger.tagName === 'A') e.preventDefault();
        const targetScreen = navTrigger.dataset.screen || navTrigger.dataset.screenLink;
        navigateToScreen(targetScreen, navTrigger.dataset.scroll || null);
      }

      const scrollTrigger = e.target.closest('[data-scroll]:not([data-screen])');
      if (scrollTrigger) {
        if (scrollTrigger.tagName === 'A') e.preventDefault();
        const parentSideNav = scrollTrigger.closest('.gigs-side-nav');
        if (parentSideNav && scrollTrigger.tagName === 'BUTTON') {
          setActiveSidebarButton(parentSideNav, scrollTrigger, 700);
        }
        const el = document.querySelector(scrollTrigger.dataset.scroll);
        if (el) el.scrollIntoView({ behavior: isMotionEnabled() ? 'smooth' : 'auto' });
      }

      const pickCatBtn = e.target.closest('[data-pick-cat]');
      if (pickCatBtn) {
        state.selectedCreatorCat = pickCatBtn.dataset.pickCat;
        renderCreatorSections();
      }

      const modeBtn = e.target.closest('[data-mode]');
      if (modeBtn) {
        state.mode = modeBtn.dataset.mode || 'verified';
        document.querySelectorAll('[data-mode]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.mode === state.mode);
        });
        renderFinanceData();
      }

      const mediaBtn = e.target.closest('[data-media-idx]');
      if (mediaBtn) {
        openMediaPreview(mediaBtn.dataset.mediaIdx, mediaBtn);
      }
    });

    // Toggle floating audit dock from footer
    document.getElementById('btnToggleAuditDock')?.addEventListener('click', () => {
      toggleAuditDock();
    });

    // Desktop vs Mobile 390px preview toggle
    const shell = document.getElementById('viewportShell');
    const btnDesk = document.getElementById('btnViewDesktop');
    const btnMob = document.getElementById('btnViewMobile');
    btnDesk?.addEventListener('click', () => {
      shell?.classList.remove('is-mobile-preview');
      btnDesk.classList.add('is-active');
      btnMob?.classList.remove('is-active');
    });
    btnMob?.addEventListener('click', () => {
      shell?.classList.add('is-mobile-preview');
      btnMob.classList.add('is-active');
      btnDesk?.classList.remove('is-active');
    });

    // Reduced motion toggle
    const motionBtn = document.getElementById('btnToggleMotion');
    motionBtn?.addEventListener('click', () => {
      state.reducedMotion = !state.reducedMotion;
      document.body.classList.toggle('gigs-reduced-motion', state.reducedMotion);
      motionBtn.textContent = state.reducedMotion ? 'Motion: OFF' : 'Motion: ON';
      motionBtn.setAttribute('aria-pressed', String(state.reducedMotion));
      setupRevealObserver();
      revealActiveScreenImmediate();
    });

    // Mobile Drawer
    const drawer = document.getElementById('mobileDrawer');
    const menu = document.getElementById('btnMobileMenu');
    const closeDrawer = () => {
      drawer.hidden = true;
      document.body.style.overflow = '';
      menu?.classList.remove('is-open');
      menu?.setAttribute('aria-expanded', 'false');
      menu?.focus();
    };
    menu?.addEventListener('click', () => {
      drawer.hidden = false;
      document.body.style.overflow = 'hidden';
      menu.classList.add('is-open');
      menu.setAttribute('aria-expanded', 'true');
      drawer.querySelector('button[data-close-drawer]')?.focus();
    });
    document.querySelectorAll('[data-close-drawer]').forEach((el) => {
      el.addEventListener('click', closeDrawer);
    });

    // Modal triggers & tabs
    document.getElementById('btnOpenAuthModal')?.addEventListener('click', () => openModal('login'));
    document.getElementById('btnMobileAuth')?.addEventListener('click', () => openModal('login', menu));
    document.getElementById('btnTriggerModalFromSys')?.addEventListener('click', () => openModal('step'));
    document.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
    document.querySelectorAll('.gigs-modal-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => renderModalTab(btn.dataset.mtab || 'login'));
    });
    const modal = document.getElementById('authModal');
    document.addEventListener('keydown', (event) => {
      const overlay = !modal?.hidden ? modal : !drawer?.hidden ? drawer : null;
      if (!overlay) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (overlay === modal) closeModal();
        else closeDrawer();
      }
      if (event.key !== 'Tab') return;
      const controls = [...overlay.querySelectorAll('button, a[href]')].filter((element) => element.getClientRects().length && !element.disabled);
      const edge = event.shiftKey ? controls[0] : controls.at(-1);
      if (!controls.includes(document.activeElement) || document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    });

    document.getElementById('communityFilters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      state.communityFilter = btn.dataset.filter || 'all';
      document.querySelectorAll('#communityFilters button').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      renderCommunityGrid();
    });

    // SVG Explorer filter & search
    document.getElementById('svgCategoryFilters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      state.svgCategory = btn.dataset.cat || 'all';
      document.querySelectorAll('#svgCategoryFilters button').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderSvgGallery();
    });

    document.getElementById('svgSearchInput')?.addEventListener('input', (e) => {
      state.svgSearch = e.target.value || '';
      renderSvgGallery();
    });
  }

  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const hashScreen = window.location.hash.replace('#', '');
    const base = window.GIGS_BASE || '';
    const localPath = base && window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname;
    const pathScreen = localPath.slice(1);
    const screenParam = params.get('screen') || (publicScreens.has(pathScreen) ? pathScreen : null) ||
      (publicScreens.has(hashScreen) ? hashScreen : 'home');
    const modeParam = params.get('mode');
    if (modeParam && Object.hasOwn(FINANCE_MODES, modeParam)) {
      state.mode = modeParam;
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === modeParam));
      renderFinanceData();
    }
    if (screenParam && document.getElementById(`screen-${screenParam}`)) {
      switchScreen(screenParam, screenParam === 'home' && /^[\w-]+$/.test(hashScreen) ? `#${hashScreen}` : null);
    }
    if (params.get('qa') === '1') {
      document.body.classList.add('gigs-reduced-motion');
      state.reducedMotion = true;
      renderFinanceData();
      document.querySelectorAll('.gigs-reveal').forEach((el) => el.classList.add('is-visible'));
      document.getElementById('venue')?.classList.add('is-venue-active');
      document.getElementById('digital-creative-movement')?.classList.add('is-surya-active', 'is-surya-locked');
    }
  }

  function init() {
    toggleAuditDock(isQaPreview);
    renderPrograms();
    renderLineups();
    renderOrganizers();
    renderMediaHighlights();
    renderCreatorSections();
    renderFinanceData();
    renderSvgGallery();
    setupSponsorPortal();
    setupCreatorPortal();
    setupOrganizerSidebar();
    setupSidebarScrollSpy();
    setupRabExports();
    bindGlobalEvents();
    attachSpringClicks();
    setupHeroCountdown();
    setupOilMotionHero();
    setupVenueAnimations();
    setupSuryaTechAnimation();
    setupAllianceParallax();
    setupSponsorSultan();
    setupNavbarSultan();
    setupStageAudioEngine();
    applyUrlParams();
    window.addEventListener('popstate', applyUrlParams);
    setupRevealObserver();
    revealActiveScreenImmediate();
    if (!urlParams.get('qa')) {
      fetch('/event/gigs-akhir-tahun-2026/api/public/participants')
        .then((response) => (response.ok ? response.json() : null))
        .then((list) => {
          if (!list) return;
          publicParticipants = { sponsors: list.sponsors || [], creators: list.creators || [] };
          renderFinanceData();
          renderCommunityGrid();
        })
        .catch(() => {});
      loadPublicConfig();
      fetch('/event/gigs-akhir-tahun-2026/api/sponsor/summary')
        .then((response) => (response.status === 200 ? response.json() : null))
        .then((summary) => {
          if (!summary) return;
          ledgerSummary = summary;
          renderFinanceData();
          const timeline = document.getElementById('transTimelineBox');
          if (!timeline) return;
          // Hanya data publik: tanggal, sponsor (jika tayang) / pos RAB, tujuan, nominal. Bukti & rekening tetap privat.
          const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
          const day = (value) => new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
          const block = (heading, rows, empty, build) => {
            const wrap = node('div', 'gigs-pub-ledger');
            wrap.append(node('p', 'gigs-pub-ledger-title', heading));
            if (!rows.length) { wrap.append(node('p', 'gigs-empty-sub', empty)); return wrap; }
            const list = node('ul', 'gigs-pub-ledger-list');
            rows.forEach((entry) => list.append(build(entry)));
            wrap.append(list);
            return wrap;
          };
          const incomes = summary.income_history || summary.history.filter((e) => !e.budget_code);
          const expenses = summary.expense_history || summary.history.filter((e) => e.budget_code);
          timeline.replaceChildren(
            block('DANA MASUK (dari mana)', incomes, 'Belum ada dana masuk yang disahkan.', (entry) => {
              const li = node('li', 'is-in');
              const main = node('div');
              main.append(node('strong', '', entry.sponsor || 'Sponsor / donatur'), node('small', '', `${day(entry.approved_at)} · TERVERIFIKASI`));
              li.append(main, node('span', 'gigs-pub-amount', `+${FORMAT_IDR(entry.amount)}`));
              return li;
            }),
            block('DANA KELUAR (untuk apa)', expenses, 'Belum ada pengeluaran yang disahkan.', (entry) => {
              const li = node('li', 'is-out');
              const main = node('div');
              const pos = RAB_ITEMS.find((budget) => budget.no === entry.budget_code);
              const PAY = { dp: 'DP', termin: 'Termin', pelunasan: 'Pelunasan', lunas: 'Lunas' };
              main.append(node('strong', '', `${entry.budget_code} · ${pos?.pos || 'Pos RAB'}${PAY[entry.pay_kind] ? ` · ${PAY[entry.pay_kind]}` : ''}`),
                node('small', '', `${day(entry.approved_at)}${entry.description ? ' · ' + entry.description : ''}`));
              li.append(main, node('span', 'gigs-pub-amount', `−${FORMAT_IDR(entry.amount)}`));
              return li;
            }),
          );
          // Koreksi: transaksi yang dibatalkan dua panitia tetap ditampilkan beserta alasannya.
          if (summary.void_history?.length) {
            timeline.append(block('KOREKSI (dibatalkan, tidak dihitung)', summary.void_history, '', (entry) => {
              const li = node('li', 'is-void');
              const main = node('div');
              main.append(node('strong', '', `${entry.kind === 'masuk' ? 'Dana masuk' : `Pengeluaran pos ${entry.budget_code}`} dibatalkan`),
                node('small', '', `${day(entry.approved_at)} · ${entry.reason}`));
              li.append(main, node('span', 'gigs-pub-amount', FORMAT_IDR(entry.amount)));
              return li;
            }));
          }
        })
        .catch(() => {});
    }
  }

  // Halaman harus dibuka lewat server (npm run dev → http://127.0.0.1:4321), bukan file langsung.
  if (location.protocol === 'file:') {
    document.addEventListener('DOMContentLoaded', () => {
      const bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:9999;padding:12px 16px;background:#E10613;color:#fff;font:600 14px/1.4 Inter,Arial,sans-serif;text-align:center';
      bar.textContent = 'Halaman dibuka sebagai file, jadi tombol Daftar/Login tidak akan jalan. Jalankan "npm run dev" lalu buka http://127.0.0.1:4321';
      document.body.append(bar);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
