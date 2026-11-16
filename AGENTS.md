<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:garage-skill-rules -->
# Wajib Gunakan Skill: UI/UX Pro Max & Superpowers (versi hemat token, Owner Nov 2026)

Mulai dari titik ini dan seterusnya, pada setiap tugas yang saya berikan:
1. **SUPERPOWERS (proporsional)**: Pahami dan perjelas spesifikasi (*spec*) sebelum coding; tanya hanya bila
   keputusannya benar-benar milik Owner. Tugas besar/berisiko (uang, stok, skema DB, banyak modul) → *implementation
   plan* rapi dulu (TDD, YAGNI, DRY) dan minta persetujuan. Tugas kecil yang jelas → langsung kerjakan dengan rencana
   singkat. Dilarang coding bar-bar tanpa memahami aturan modul (skill modul di `CLAUDE.md`).
2. **SUBAGEN HEMAT**: Subagen hanya untuk tugas besar yang sudah disetujui dan bisa dipecah jadi bagian independen,
   atau bila Owner memintanya. Jangan memakai subagen untuk pencarian/edit yang bisa dikerjakan langsung (subagen
   mulai dari nol dan membaca ulang konteks = boros token).
3. **UI/UX PRO MAX**: Untuk pekerjaan antarmuka, jalankan instruksi `ui-ux-pro-max` (premium, modern, standar UX
   ketat), tetap tunduk pada palet Garage, `design-system/MASTER.md`, dan Crystal V5. Tugas non-UI tidak perlu memuatnya.
<!-- END:garage-skill-rules -->

<!-- BEGIN:garage-token-rules -->
# Wajib untuk semua agent (Claude Code, Codex, Cursor, Copilot, subagent)

- Baca `CLAUDE.md` (ringkas) lalu ikuti bagian **"WAJIB: Skill Modul & Hemat Token"**.
- Di awal setiap tugas baca `.claude/skills/hemat-token/SKILL.md` dan bekerja dengan cara itu.
- Sebelum menyentuh kode suatu modul, baca `.claude/skills/<skill-modul>/SKILL.md` sesuai tabel indeks di `CLAUDE.md`
  (garage-pos, garage-kas, garage-produksi, garage-produk-wms, garage-meja-menu, garage-member-cx, garage-approval,
  garage-ai-mcp, garage-partner-hub, garage-ops-deploy, garage-ui-tooling, garage-motion). Aturan di skill = aturan Owner, mengikat penuh.
- Website/halaman web: ikuti `.claude/skills/garage-website/SKILL.md` (Utama `ui-ux-pro-max` + `frontend-design`;
  Wajib `web-design-guidelines` + `vercel-react-best-practices`).
<!-- END:garage-token-rules -->
