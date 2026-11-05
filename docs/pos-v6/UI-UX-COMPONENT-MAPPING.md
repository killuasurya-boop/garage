# UI/UX Component Mapping (POS V6)

Detail design system: `docs/design-system/POS-V6-DESIGN-SYSTEM.md`.

| Papan | Komponen | File |
|---|---|---|
| 01 Sidebar | `PosV6NavGroup/NavItem/ThemeSwatches` (+ QC Kasir) | `src/components/garage/pos/pos-v6.tsx`, `pos-view.tsx` |
| 02 Header | `PosV6Brand/ShiftChip/Clock/Kpi/TopbarButton/Profile`, `PosV6ConnectionChip` | `pos-v6.tsx`, `pos-v6-qc.tsx` |
| 03 Katalog | `PosV6CategoryTile`, `PosV6ProductCard` | `pos-v6.tsx` |
| 04 Keranjang | bill panel V6 | `pos-view.tsx`, `pos-v6.css` |
| 05 Pembayaran | metode berikon, `CashPaymentPanel` (tanpa isi otomatis), QRIS/Transfer/E-Wallet, `finalPayLabel` | `pos/pos-checkout-panels.tsx`, `src/lib/pos-final-pay-label.ts` |
| 06 Operasional | kartu order QR, peta meja | `pos-view.tsx` |
| 07 Shift | `PosV6ShiftInfo`, grid pecahan | `pos-v6.tsx`, `cash-denomination-grid.tsx` |
| 08 Theme Studio | `PosV6ThemeStudio` + lanjutan Owner | `pos/pos-v6-theme-studio.tsx`, `pos-v6-theme-custom.ts` |
| QC | `PosV6QcPanel` | `pos/pos-v6-qc.tsx`, `src/lib/print-health.ts` |
| Penjualan Langsung | Quick Retail V6 | `pos/pos-quick-retail.tsx` |
