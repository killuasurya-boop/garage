// Tambalan app.js halaman event platform GIGS (Owner 18 Nov 2026). Platform = stack terpisah (kode di luar repo ini);
// Caddy meneruskan GET /event/<slug>/public/app.js ke Garage OS, yang menyajikan file asli dengan koreksi kecil.
// Koreksi hanya dipasang bila jangkarnya ditemukan (tepat satu kali, atau ≥1 untuk `all`); selain itu dilewati.

/** `all` = ganti setiap kemunculan (minimal satu); tanpa `all` jangkar harus muncul TEPAT satu kali. */
export type AppJsPatch = { id: string; find: string; replace: string; all?: boolean };

export const GIGS_APP_JS_PATCHES: readonly AppJsPatch[] = [
  {
    // Bug platform: lineup dari slot dirender ulang SETELAH animasi "muncul" dipasang, jadi kartu baru tetap
    // transparan sampai pengunjung pindah menu. Pasang ulang pengamat animasi setelah render.
    id: "lineup-reveal",
    find: "isCta: true });\n      renderLineups();\n",
    replace: "isCta: true });\n      renderLineups();\n      setupRevealObserver();\n      revealActiveScreenImmediate();\n",
  },
  {
    // Nama resmi talent (Owner 17–18 Nov 2026): lineup bawaan platform masih menulis "SURAU".
    id: "surai-name",
    find: "name: 'SURAU',",
    replace: "name: 'SURAI',",
    all: true,
  },
  {
    // Foto penampil dari Garage OS (Owner 19 Nov 2026): slot lineup boleh membawa `photo` (unggahan Kontrol → Lineup).
    // Spread setelah foto bawaan → foto Garage menang; tanpa foto tetap foto umum platform.
    id: "lineup-photo",
    find: "/photos/lineup-${(i % 5) + 1}.jpg`,",
    replace: "/photos/lineup-${(i % 5) + 1}.jpg`, ...(slot.photo ? { photo: String(slot.photo) } : {}),",
  },
];

/**
 * Tombol "Login Panitia" (Owner 18 Nov 2026) di menu halaman event: desktop (#mainNavLinks) dan HP (.gigs-drawer-nav),
 * menuju login Garage OS → Ruang Panitia. Ditambahkan di akhir file, sekali saja (penanda `__garagePanitiaLogin`).
 */
export const PANITIA_LOGIN_SNIPPET = `
;(() => {
  if (window.__garagePanitiaLogin) return;
  window.__garagePanitiaLogin = true;
  const href = '/login?next=/panitia';
  const add = () => {
    const nav = document.getElementById('mainNavLinks');
    if (nav && !nav.querySelector('[data-garage-panitia]')) {
      const a = document.createElement('a');
      a.className = 'gigs-nav-item';
      a.href = href;
      a.dataset.garagePanitia = '1';
      a.textContent = 'LOGIN PANITIA';
      nav.append(a);
    }
    const drawer = document.querySelector('.gigs-drawer-nav');
    if (drawer && !drawer.querySelector('[data-garage-panitia]')) {
      const a = document.createElement('a');
      a.className = 'gigs-drawer-link is-compact';
      a.href = href;
      a.dataset.garagePanitia = '1';
      a.innerHTML = '<span class="gigs-drawer-idx">P</span><span class="gigs-drawer-copy"><strong>Login Panitia</strong><small>Check-in, panggung &amp; tugas</small></span><span class="gigs-drawer-arrow" aria-hidden="true">&rarr;</span>';
      drawer.append(a);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
`;

function countOf(haystack: string, needle: string) {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1;
  return count;
}

/** Pasang koreksi yang jangkarnya unik; laporkan mana yang terpasang/dilewati (untuk log server). */
export function patchGigsAppJs(source: string, patches: readonly AppJsPatch[] = GIGS_APP_JS_PATCHES) {
  let code = source;
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const patch of patches) {
    // Sudah terpasang (mis. platform sendiri sudah memperbaikinya) → jangan dipasang dua kali.
    if (!patch.all && code.includes(patch.replace)) {
      applied.push(patch.id);
      continue;
    }
    const count = countOf(code, patch.find);
    if (patch.all ? count >= 1 : count === 1) {
      code = patch.all ? code.split(patch.find).join(patch.replace) : code.replace(patch.find, () => patch.replace);
      applied.push(patch.id);
    } else {
      skipped.push(patch.id);
    }
  }
  if (!code.includes("__garagePanitiaLogin")) {
    code += PANITIA_LOGIN_SNIPPET;
    applied.push("panitia-login");
  }
  return { code, applied, skipped };
}
