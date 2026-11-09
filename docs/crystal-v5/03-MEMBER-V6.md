# Member V6 — Ultimate Cinematic Member (Owner, 9 Nov 2026)

Acuan: `docs/design-references/member-v6/` (01 kartu 3D, 02 login desktop, 03 daftar desktop, 04 storyboard).

## Yang dibuat
- **Kartu 3D nyata (Three.js)** `src/components/garage/member-auth/cinematic3d/member-card-scene.ts`:
  - Geometri: `RoundedBoxGeometry` (tebal 0,07, bevel, sudut membulat).
  - Material: `MeshPhysicalMaterial` (logam brushed + clearcoat kristal), dengan pantulan `RoomEnvironment` (PMREM).
  - Muka kartu: kanvas berisi logo resmi, emblem resmi, nama tier, dan tepi bercahaya per tier (Silver perak, Gold emas, Platinum perak + merah).
  - Suasana: laser merah aditif, partikel ringan, pedestal batu, lantai logam gelap dengan vinyet.
- **Kamera sinematik:**
  - Dolly masuk saat halaman dibuka.
  - Orbit dan tilt terbatas mengikuti pointer, dengan damping, lalu kembali netral.
  - Kartu masuk berurutan dari kedalaman, melayang pelan, dan disapu cahaya.
  - Layar sentuh: kamera tidak mengikuti jari, jadi scroll tidak terganggu.
- **Wrapper** `member-card-stage.tsx`:
  - Bundel 3D dimuat lazy setelah form HTML tampil.
  - Kualitas adaptif (HP dan perangkat lemah: DPR 1,25, partikel lebih sedikit).
  - Loop berhenti saat tab atau elemen tidak terlihat.
  - Semua resource GPU dilepas saat komponen dilepas.
  - Tanpa WebGL: fallback kartu CSS bertema sama.
- **Halaman** `member-login-page.tsx` + `member-v6.css`:
  - Desktop: showcase kiri (±60%), panel kaca kanan.
  - HP: logo, kartu ringkas, judul, form, lalu keuntungan.
  - Intro sinematik sekali per sesi (laser lalu logo reveal), tidak memblokir form.
  - Validasi inline: HP < 10 digit, format email.
  - Tombol PIN tampil/sembunyi.
  - Loading Google "Menghubungkan ke Google…" (redirect tidak ditahan).
  - Overlay "Berhasil Masuk!".
  - Layar **Pendaftaran Berhasil!** dengan kartu 3D sesuai tier dari backend.
- **Daftar:** centang S&K wajib, dan dicatat ke `member_accounts.terms_accepted_at` (`acceptTerms`).

## Sengaja berbeda dari gambar
| Referensi | Implementasi | Alasan |
|---|---|---|
| Chip kartu, simbol NFC | Tidak ada | Kartu identitas member, bukan kartu bayar (CLAUDE.md aturan 15) |
| Tombol Google selalu tampil | Tampil hanya bila server punya Client ID | Tidak boleh ada tombol palsu |
| Gelas es kopi cutout | Foto es kopi asli dengan mask melingkar | Belum ada aset cutout resmi; tidak dibuat AI |
| Lantai pantul cermin | Lantai logam gelap + vinyet | Lantai cermin terlihat sebagai kotak abu-abu dan berat di HP |
| React Three Fiber / Drei | Three.js murni 0.180 (sudah terpasang) + kamera manual | Tanpa dependensi baru; hasil render sama |
| Poin/voucher contoh di storyboard | Tidak ditampilkan | Tidak memalsukan data; sukses hanya menampilkan tier dari backend |

## Uji
`e2e/member-v6.spec.ts` mencakup:
- Lebar 1440, 1920, 1024, 768, 390, dan 360: kartu 3D siap, tanpa overflow.
- Validasi HP.
- Show/hide PIN.
- S&K wajib.
- Daftar sampai sukses (tier Silver dari backend), lalu ke `/member`.

`e2e/member-google.spec.ts` (lengkapi profil Google) tetap lulus.

## V6+ (9 Nov 2026) — penutupan kekurangan
- **Render 3D:**
  - Tekstur muka kartu 2048px pada kualitas tinggi (1024px pada kualitas rendah), dengan anisotropi maksimum GPU.
  - Bloom selektif (`UnrealBloomPass` dari three/examples, tanpa dependensi baru) hanya pada kualitas tinggi, sehingga hanya laser dan tepi kartu yang menyala.
  - Kualitas adaptif: 45 frame pertama diukur. Bila rata-rata di atas 22 ms, bloom dimatikan, DPR turun ke 1,25, dan debu dikurangi.
  - Intro mengikuti waktu nyata, sehingga tidak berlarut-larut di perangkat lambat.
  - Kanvas baru per mode, karena konteks WebGL yang sudah dilepas tidak bisa dipakai ulang.
- **Membership Tier (referensi 01)** di halaman daftar:
  - Mode scene `tiers`: Silver, Gold (tengah, lebih besar), Platinum di atas pedestal bulat dengan cincin menyala.
  - Carousel: panah, titik, dan tombol ←/→, dengan nama tier diumumkan ke pembaca layar (aria-live).
  - Keuntungan dan poin minimum diambil dari `memberLevelRules`.
- **Animasi storyboard:**
  - Bar progres "Memuat pengalaman member…" di intro.
  - Sapuan kilau merah sekali saat input fokus, dan label ikut menyala.
  - Crossfade dan geser 300 ms saat berpindah login ↔ daftar.
  - Semua animasi mati saat reduced-motion.

## V6+ D — Video promo member (Remotion)
- `video/member-promo/` (package terpisah, tidak masuk bundel/lint/tsc root), komposisi 15 dtk 1080×1920 dan 1920×1080.
- Isi: logo reveal → kartu Silver/Gold/Platinum → keuntungan nyata → CTA `garagecoffee.id/member-login`. MP4 tidak di-commit (`out/`).
- Lisensi Remotion: gratis ≤ 3 orang, selebihnya Company License (keputusan Owner). Lihat README folder.
