# Design handoff: Claude Code <-> ChatGPT

Koordinasi lewat berkas, bukan lewat koneksi langsung (tidak ada jalur langsung antar keduanya).
Konteks warna dan larangan: `docs/CHATGPT-DESIGN-WORKFLOW.md` bagian 3.

## Alur

1. **Claude Code** menulis brief di `briefs/NNN-nama.md` dari `briefs/_TEMPLATE.md` (status `OPEN`).
2. **Kamu** menempel isi brief ke ChatGPT Project (blok konteks sudah di Instructions).
3. **ChatGPT** merender aset. Kamu simpan hasilnya ke `assets-incoming/NNN-nama/` (atau ChatGPT yang
   mendorongnya bila ia punya akses GitHub ke branch aset, lihat Keamanan) dan ubah status brief jadi `DELIVERED`.
4. **Claude Code** memeriksa aset terhadap checklist brief, mengoptimalkan (WebP, ukuran), memasangnya ke
   `public/` dan komponen, lalu verifikasi 1366x900 dan 390x844. Status jadi `REVIEWED` atau `REWORK` dengan
   catatan yang bisa langsung ditempel balik ke ChatGPT.
5. Status akhir `SHIPPED` setelah lint, build dan QA lolos.

Status: `OPEN` -> `DELIVERED` -> `REVIEWED` | `REWORK` -> `SHIPPED`.

## Aturan

- Satu brief = satu layar atau satu kebutuhan aset. Jangan campur.
- Aset dari ChatGPT tidak boleh berisi teks, harga, logo yang digambar ulang, atau data karangan.
- Claude Code tidak pernah menerima klaim "sudah sesuai" tanpa memeriksa filenya.
- Nama file kebab-case, WebP/SVG, jangan menimpa aset yang sudah dipakai produksi.

## Keamanan (kalau ChatGPT diberi akses GitHub)

Repo utama berisi kode dan logika kas. Jangan beri ChatGPT tulis ke repo utama. Pakai repo terpisah khusus aset
(mis. `garage-design-assets`) atau branch `design-assets/*` tanpa akses ke `main`, tanpa secrets, dan tanpa
izin merge. Keputusan akses ada di Owner.
