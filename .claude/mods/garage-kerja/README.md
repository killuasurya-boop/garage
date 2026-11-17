# garage-kerja — mod Claude Code untuk Garage OS

Mod ini mengubah cara Claude bekerja di repo Garage OS, bukan aplikasinya. Pelanggan, kasir, dan panitia tidak melihat bedanya.

## Isi
- **Panel "Garage · Kerja"**: branch & commit terakhir, jumlah berkas belum di-commit, skill modul yang sudah dimuat di sesi ini, dan hasil E2E terakhir (progres langsung saat berjalan). Buka dengan `/garage-panel`.
- **Penjaga skill modul**: Edit/Write berkas modul di `src/` atau `e2e/` (POS, kas, produksi, WMS, meja, member, approval, AI/MCP, mitra, event) ditahan sampai skill modulnya dimuat, sesuai aturan WAJIB di `CLAUDE.md`.
- **Penjaga rahasia**: `git commit`/`git push` dan penulisan berkas ditahan bila memuat kode masuk panitia GIGS, private key, token GitHub/AWS/Google/API, atau nilai rahasia env. Hanya nama polanya yang ditampilkan, nilainya tidak.
- **`/cek-event`**: menjalankan E2E event (`gigs-eo`, `gigs-website`, `decision-center`); `/cek-event semua` untuk suite lengkap. Hasil tampil di panel, toast, dan notifikasi.

## Pasang
Di komputer (Claude Code terminal), dari root repo:

```bash
claude --plugin-dir .claude/mods/garage-kerja
```

Atau tetap aktif tiap sesi: tambahkan path absolut folder ini ke `CLAUDE_CODE_PLUGIN_DIRS` di `env` pada `~/.claude/settings.json`.

## Cek
```bash
claude plugin validate .claude/mods/garage-kerja
claude plugin test .claude/mods/garage-kerja
```
