---
name: garage-motion
description: Satu pintu untuk SEMUA pekerjaan animasi/motion Garage OS (bikin, review, audit, perbaiki jank, reduced motion, GSAP/ScrollTrigger, Framer Motion, SVG, page transition, micro-interaction, Lottie, istilah animasi). Berisi aturan motion Garage + tabel yang menunjuk SATU file referensi di ref/ untuk dibaca. Muat sebelum menambah atau mengubah animasi apa pun.
---

# Garage Motion — router

19 skill animasi pihak ketiga digabung di sini (Nov 2026, hemat token): isinya tidak berubah, hanya
dipindah ke `ref/<nama>/` sehingga tidak dimuat di setiap sesi. Lisensi: `ref/_licenses/`.

## Aturan Garage (selalu menang atas isi ref/)
- Layar operasional (POS, Produksi, Inventory, Kas, Approval): cepat dan menahan diri — fade/slide
  masuk 150–300 ms, tekan ±90 ms (`design-system/MASTER.md`), glow navigasi aktif, hover lift, state terpilih, transisi
  drawer/dialog. Tanpa parallax, blur berat, animasi tak berujung, atau efek yang menggeser layout.
  `.phv4`/`.phv7-*` (Production Hub) tidak boleh punya animasi infinite (dijaga test).
- Permukaan pelanggan (website, `/order`, member): boleh sinematik (Crystal V5, Member V6, Cinematic
  Laser UI di `src/components/garage-website/cinematic/`), tetap ringan untuk tablet/HP.
- Selalu hormati `prefers-reduced-motion` (UI harus berfungsi penuh tanpa motion).
- Urutan alat: CSS → `framer-motion` (terpasang) → GSAP `gsap@3.15.0` (sudah disetujui Owner, untuk
  website sinematik). Lottie BUKAN dependency: tanya Owner sebelum menambah.
- Hanya animasikan `transform`/`opacity` kecuali ada alasan kuat.
- Palet & desain tetap dari `design-system/MASTER.md` / Crystal V5; motion tidak boleh mengubah brand.

## Pilih SATU referensi, baca hanya file itu
| Tugas | Baca |
|---|---|
| Bikin animasi baru dari nol (perlu animasi? kurva, durasi, interupsi, exit) | `ref/animate/SKILL.md` |
| Review satu diff/komponen animasi | `ref/review-animations/SKILL.md` |
| Audit motion seluruh codebase / roadmap perbaikan | `ref/improve-animations/SKILL.md` |
| Filosofi polish UI & detail (Emil Kowalski) | `ref/emil-design-eng/SKILL.md` |
| Timing, easing, koreografi, prinsip Disney | `ref/motion-design/SKILL.md` (lalu satu file di `director/`/`reference/` yang ditunjuk) |
| Hover/press, toggle, toast, drawer/modal, list reorder, layout transition (Framer Motion/CSS) | `ref/micro-interaction/SKILL.md` |
| Transisi halaman/route Next.js App Router, View Transitions | `ref/page-transition-animation/SKILL.md` |
| Animasi patah-patah / bukan 60fps / layout thrashing | `ref/60fps-animation/SKILL.md` |
| Reduced motion, WCAG 2.3.3, gating GSAP/Framer | `ref/accessible-animation/SKILL.md` |
| SVG: draw-on, morph, motion path, ikon/logo | `ref/svg-animation/SKILL.md` |
| Lottie / dotLottie (hanya bila Owner setuju) | `ref/lottie-animation/SKILL.md` |
| "Efek ini namanya apa?" | `ref/animation-vocabulary/SKILL.md` |
| GSAP dasar: `to/from`, easing, stagger, `matchMedia` | `ref/gsap-core/SKILL.md` |
| GSAP timeline / urutan | `ref/gsap-timeline/SKILL.md` |
| GSAP ScrollTrigger (pin, scrub) | `ref/gsap-scrolltrigger/SKILL.md` |
| GSAP di React/Next (`useGSAP`, cleanup) | `ref/gsap-react/SKILL.md` |
| GSAP performa | `ref/gsap-performance/SKILL.md` |
| GSAP plugin (Flip, Draggable, SplitText, …) | `ref/gsap-plugins/SKILL.md` |
| `gsap.utils` (clamp, mapRange, snap, …) | `ref/gsap-utils/SKILL.md` |

Tugas gabungan (mis. GSAP ScrollTrigger di React): baca maksimal dua file yang paling relevan.
Jangan membaca seluruh `ref/`. Setelah selesai, cek visual dengan `node scripts/ui-check.mjs <path>`.
