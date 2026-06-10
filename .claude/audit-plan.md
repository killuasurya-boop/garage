# Audit Digital Menu - Garage OS

## Tujuan
Pastikan semua halaman, modul, route, dan navigasi terhubung dengan benar di menu digital tanpa bug.

## Scope Audit

### 1. Menu Digital Navigation
- [ ] Verifikasi semua modul di `roleModules` memiliki halaman terkait di `garage-app.tsx`
- [ ] Cek tidak ada halaman orphan (ada route tapi tidak di menu)
- [ ] Cek tidak ada menu item mati (di menu tapi halaman tidak ada)
- [ ] Verifikasi role access — setiap role punya modul yang sesuai

### 2. API Route → Database Schema
- [ ] Cek semua API routes memiliki schema table yang sesuai
- [ ] Cek field mapping API ↔ DB
- [ ] Cek tidak ada API route yang mengakses field non-existent

### 3. Data Integrity
- [ ] Cek `garage-data.ts` seed data konsisten dengan schema
- [ ] Cek `garage-service.ts` query/mutation match schema
- [ ] Cek circular dependencies

### 4. Type Safety
- [ ] Cek TypeScript compilation
- [ ] Cek inconsistent types antara client/server
- [ ] Cek Zod validation di semua API routes

### 5. Cross-link Navigation
- [ ] Cek navigasi antar modul (contoh: POS → Kitchen, Finance → Audit)
- [ ] Cek module registry consistency
