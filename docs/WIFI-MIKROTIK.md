# WiFi Gratis Khusus Member — MikroTik Hotspot

Pelanggan konek ke WiFi Garage → halaman login hotspot otomatis membuka
`https://<domain-garage>/wifi` → pelanggan **daftar / masuk member** (nama +
nomor WhatsApp aktif) → tekan **Sambungkan WiFi** → internet terbuka selama
durasi sesi (default 3 jam). Setiap login tercatat (Pengaturan → Integrasi →
WiFi Gratis Member).

## Cara kerja (singkat)
- Router menarik skrip dari Garage OS setiap hari pukul 00:01 (dan saat boot),
  jadi VPS **tidak** perlu bisa menjangkau router (aman untuk koneksi rumahan / NAT).
- Skrip membuat user hotspot bersama `garage-member` dengan **password harian**
  (berganti tiap hari, dihitung dari `GARAGE_WIFI_SECRET`, tidak disimpan di DB).
- Password hanya diberikan halaman `/wifi` kepada member yang sudah login, lalu
  dikirim otomatis ke router. Pelanggan tidak perlu mengetik password.

## 1. Server (.env.production)
```
GARAGE_WIFI_SECRET=<min 16 karakter acak>
GARAGE_WIFI_ROUTER_KEY=<min 16 karakter acak, berbeda>
```
Deploy ulang. Lalu di Garage OS: **Pengaturan → WiFi Member → Aktifkan**, atur
nama SSID, lama sesi, dan jumlah perangkat.

## 2. MikroTik (Winbox → New Terminal)
Hotspot sudah dibuat (IP → Hotspot → Hotspot Setup). Lalu:

**a. Walled garden** — halaman Garage bisa dibuka sebelum login:
```
/ip hotspot walled-garden add dst-host=<domain-garage> comment="Garage OS"
/ip hotspot walled-garden add dst-host=*.<domain-garage> comment="Garage OS"
```

**b. Sinkron password harian** (ganti `KEY` dengan `GARAGE_WIFI_ROUTER_KEY`):
```
/system script add name=garage-wifi-sync source="/tool fetch url=\"https://<domain-garage>/api/wifi/router-script?key=KEY\" dst-path=garage-wifi.rsc; :delay 2s; /import file-name=garage-wifi.rsc"
/system scheduler add name=garage-wifi-daily start-time=00:01:00 interval=1d on-event=garage-wifi-sync
/system scheduler add name=garage-wifi-boot start-time=startup on-event=garage-wifi-sync
/system script run garage-wifi-sync
```
Cek: **IP → Hotspot → Users** harus ada `garage-member`.

**c. Halaman login** — Files → `hotspot/login.html`, ganti isinya dengan:
```html
<html><head><meta http-equiv="refresh" content="0; url=https://<domain-garage>/wifi?mac=$(mac)&ip=$(ip)&login=$(link-login-only)&dst=$(link-orig-esc)"></head><body>Membuka WiFi Garage…</body></html>
```
Perintah siap salin (domain sudah terisi) ada di **Pengaturan → Integrasi →
WiFi Gratis Member**.

## 3. Uji
1. Sambungkan HP ke SSID Garage → halaman WiFi Garage muncul.
2. Daftar member (nomor WA aktif) → kembali ke halaman WiFi → **Sambungkan WiFi**.
3. Internet terbuka; login tercatat di panel WiFi.

## Catatan & batasan
- Alamat login router harus IP lokal (10.x / 172.16–31.x / 192.168.x / 100.64.x)
  atau nama DNS hotspot yang diisi di Pengaturan, supaya password tidak bisa
  dipancing ke server lain.
- Password harian bisa diceritakan dari mulut ke mulut, tapi berganti setiap hari
  dan hanya berguna bagi yang sudah terhubung ke WiFi Garage.
- Matikan WiFi member di Pengaturan → user `garage-member` ikut dinonaktifkan
  pada sinkron berikutnya (jalankan `garage-wifi-sync` untuk langsung).
