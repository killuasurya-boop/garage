# GARAGE Warehouse Management System
### Next.js · Enterprise WMS · 2026 Edition

> **Garage Warehouse** bukan sekadar aplikasi stok. Ini adalah **platform Back Office modern** yang mengintegrasikan Warehouse, Supplier, Kitchen, Bar, Recipe, dan Production dalam satu ekosistem yang cepat, akurat, bersih, dan mudah digunakan — fondasi Garage ERP masa depan.

---

## Daftar Isi

1. [Overview & Visi Produk](#1-overview--visi-produk)
2. [Tech Stack 2026](#2-tech-stack-2026)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Design System & Animasi](#4-design-system--animasi)
5. [Sistem SKU & Barcode](#5-sistem-sku--barcode)
6. [Struktur Folder Next.js](#6-struktur-folder-nextjs)
7. [Modul Sistem (12 Modul)](#7-modul-sistem-12-modul)
8. [Database Schema](#8-database-schema)
9. [API Routes & Endpoints](#9-api-routes--endpoints)
10. [Komponen UI Utama](#10-komponen-ui-utama)
11. [Animation Playbook](#11-animation-playbook)
12. [Security & RBAC](#12-security--rbac)
13. [Dashboard & KPI Real-time](#13-dashboard--kpi-real-time)
14. [Laporan & Analytics](#14-laporan--analytics)
15. [Deployment & DevOps](#15-deployment--devops)
16. [Roadmap & KPI Sukses](#16-roadmap--kpi-sukses)

---

## 1. Overview & Visi Produk

| Item | Detail |
|------|--------|
| **Nama Produk** | Garage Warehouse Management System |
| **Versi** | `1.0.0-MVP` |
| **Perusahaan** | GARAGE Coffee & Motor |
| **Platform** | Web Responsive — Desktop-first |
| **Arsitektur** | Modular Enterprise, Microservice-ready |
| **Target Launch** | Q3 2026 |
| **Bahasa** | TypeScript (100%) |

### Masalah yang Diselesaikan

```
❌ BEFORE                          ✅ AFTER (Garage WMS)
─────────────────────────────────────────────────────────
Pencatatan stok manual di Excel    → Real-time inventory dengan SKU & barcode
Human error ~15% per bulan         → Target < 2% dalam 12 bulan
Waste bahan baku tidak terdeteksi  → Waste tracking terklasifikasi
Food cost tidak terkontrol         → Recipe cost & production tracking
Multi-outlet tidak terkoordinasi   → Multi-warehouse unified dashboard
Tidak ada audit trail              → Audit log semua transaksi
```

### Target Pengguna

| Role | Akses | Kebutuhan Utama |
|------|-------|-----------------|
| Super Admin | Full system | System config, master data |
| Owner | Dashboard & Reports | Cost, KPI, profit view |
| Warehouse Manager | Semua modul | Daily operations |
| Staff Gudang | Receiving, Transfer, Inventory | Scan & input |
| Kitchen Head | Request only | Buat & track request |
| Bar Head | Request only | Buat & track request |

---

## 2. Tech Stack 2026

### Frontend

```typescript
// Core
Next.js 15          // App Router, Server Components, Turbopack
React 19            // Concurrent features, Server Actions
TypeScript 5.5      // Strict mode, full type coverage

// Styling
Tailwind CSS 4.0    // CSS-first config, OKLCH colors
shadcn/ui           // Radix primitives, accessible components

// Animation ⭐ KEY LIBRARY
Framer Motion 11    // Page transitions, micro-interactions, gestures
GSAP 3.12          // Complex timeline animations (barcode scan effect)
Lottie React        // Loading states, success/error animations

// State & Data
TanStack Query v5   // Server state, caching, real-time sync
Zustand 5           // Client state (filters, UI state)
React Hook Form     // Form management
Zod                 // Schema validation (shared with backend)

// Barcode & QR
@zxing/browser      // Barcode scanner (camera input)
bwip-js             // Barcode generator (Code128, QR, EAN13, DataMatrix)
react-barcode       // Barcode display component
qrcode.react        // QR code generator

// Charts & Data Viz
Recharts 3          // Dashboard charts (line, bar, area, pie)
@nivo/core          // Advanced visualizations (heatmap, treemap)

// Utilities
date-fns 4          // Date formatting & manipulation
numeral.js          // Number formatting (IDR currency)
Papa Parse          // CSV import/export
xlsx                // Excel export
```

### Backend

```typescript
// API Layer
Node.js 22 LTS      // Runtime
NestJS 11           // Framework (modules, guards, interceptors)
Fastify adapter     // High-performance HTTP

// Database
PostgreSQL 17       // Primary database (JSONB, partitioning)
Prisma 6            // ORM + migrations
Redis 8             // Cache, session, real-time pub/sub

// Real-time
Socket.io 4         // WebSocket (stock alerts, live dashboard)

// Storage
MinIO / AWS S3      // File storage (product images, documents)

// Auth
JWT (RS256)         // Access token (15 min)
JWT Refresh         // Refresh token (7 days, httpOnly cookie)
bcrypt              // Password hashing

// Infrastructure
Docker 27           // Containerization
GitHub Actions      // CI/CD pipeline
Nginx               // Reverse proxy, SSL termination
```

---

## 3. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Next.js 15)                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │Dashboard │  │Inventory │  │ SKU/Scan  │  │  Reports     │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS + WebSocket
┌────────────────────────▼────────────────────────────────────────┐
│                    API GATEWAY (NestJS)                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐   │
│  │  Auth   │  │RBAC     │  │Rate     │  │ Audit Logger    │   │
│  │  Guard  │  │Guard    │  │Limiter  │  │ (every request) │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘   │
└────────┬────────┬────────┬────────┬────────┬────────────────────┘
         │        │        │        │        │
    ┌────▼──┐ ┌───▼──┐ ┌──▼───┐ ┌──▼───┐ ┌─▼──────┐
    │Invent-│ │Suppl-│ │Kitch-│ │Repor-│ │Notific-│
    │ory Svc│ │ier   │ │en Svc│ │ts Svc│ │ation   │
    └────┬──┘ └───┬──┘ └──┬───┘ └──┬───┘ └─┬──────┘
         └────────┴────────┴────────┴────────┘
                         │
              ┌───────────▼──────────┐
              │    PostgreSQL 17      │
              │  + Redis (cache)      │
              └──────────────────────┘
```

### App Router Structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── layout.tsx
├── (dashboard)/
│   ├── layout.tsx              ← Sidebar + Header
│   ├── page.tsx                ← Dashboard utama
│   ├── inventory/
│   │   ├── page.tsx            ← Inventory list
│   │   ├── [id]/page.tsx       ← Detail produk
│   │   └── scan/page.tsx       ← Barcode scanner
│   ├── receiving/
│   ├── transfer/
│   ├── supplier/
│   ├── kitchen/
│   ├── bar/
│   ├── recipe/
│   ├── production/
│   ├── stock-opname/
│   ├── adjustment/
│   └── reports/
└── api/
    └── [...]/route.ts          ← API proxy ke NestJS
```

---

## 4. Design System & Animasi

### Color Palette

```css
:root {
  /* Brand */
  --garage-red:     #C8102E;   /* Primary action, critical alerts */
  --garage-red-10:  #FDF1F3;   /* Red tint backgrounds */
  --garage-red-20:  #FAD7DC;   /* Red hover state */

  /* Neutrals */
  --graphite:       #2F3136;   /* Dark headers, sidebar */
  --graphite-80:    #484D55;   /* Secondary text on dark */
  --graphite-10:    #F8F9FB;   /* Page background */

  /* Status Colors */
  --status-green:   #16A34A;   /* In stock, success */
  --status-amber:   #D97706;   /* Low stock, warning */
  --status-red:     #DC2626;   /* Out of stock, critical */
  --status-blue:    #2563EB;   /* In progress, info */
  --status-purple:  #7C3AED;   /* System, analytics */

  /* Surface */
  --surface-1:      #FFFFFF;   /* Cards */
  --surface-2:      #F8F9FB;   /* Page bg */
  --surface-3:      #F3F4F6;   /* Input bg, light chips */
  --border:         #E8E8E8;   /* Default border */
  --border-strong:  #D1D5DB;   /* Focused border */

  /* Text */
  --text-primary:   #111111;
  --text-secondary: #6B7280;
  --text-muted:     #9CA3AF;
}
```

### Typography Scale

```css
/* Font: Inter (display) + JetBrains Mono (code/SKU) */

--text-xs:    0.625rem;    /* 10px — labels, eyebrows */
--text-sm:    0.75rem;     /* 12px — captions, badges */
--text-base:  0.8125rem;   /* 13px — body text */
--text-md:    0.875rem;    /* 14px — standard body */
--text-lg:    1rem;        /* 16px — subheadings */
--text-xl:    1.25rem;     /* 20px — section titles */
--text-2xl:   1.375rem;    /* 22px — page headers */
--text-3xl:   1.875rem;    /* 30px — KPI numbers */
--text-4xl:   2.25rem;     /* 36px — hero metrics */

/* Weight: 400 body | 500 medium | 600 semibold | 700 bold | 800 black */
```

### Spacing & Radius

```css
/* Spacing: 4px base grid */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;

/* Border Radius */
--radius-sm:  6px;    /* Badges, chips */
--radius-md:  8px;    /* Buttons, inputs */
--radius-lg:  10px;   /* Cards */
--radius-xl:  14px;   /* Modals, large cards */
--radius-2xl: 20px;   /* Pills */
```

---

## 5. Sistem SKU & Barcode

### SKU Format

Setiap produk memiliki **SKU unik yang di-generate otomatis** mengikuti format terstruktur:

```
Format: [KATEGORI]-[SUBKAT]-[SEQ]-[CHECK]

Contoh:
  BVR-COF-0001-A    → Beverage / Coffee / item ke-1
  FNB-DRY-0042-C    → Food & Beverage / Dry Goods / item ke-42
  PKG-CUP-0007-B    → Packaging / Cup / item ke-7
  CHM-CLN-0003-D    → Chemical / Cleaning / item ke-3
  EQP-BAR-0015-E    → Equipment / Bar / item ke-15

Komponen:
  [KATEGORI] = 3 huruf kapital dari kategori utama
  [SUBKAT]   = 3 huruf kapital dari sub-kategori
  [SEQ]      = 4 digit sequence number (auto-increment)
  [CHECK]    = 1 huruf checksum (A-Z, untuk validasi)
```

### SKU Generation Logic

```typescript
// lib/sku.ts

export function generateSKU(
  category: string,
  subCategory: string,
  sequence: number
): string {
  const cat = category.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const sub = subCategory.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const seq = String(sequence).padStart(4, '0');
  const check = generateChecksum(`${cat}${sub}${seq}`);
  return `${cat}-${sub}-${seq}-${check}`;
}

function generateChecksum(input: string): string {
  const sum = input.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return String.fromCharCode(65 + (sum % 26)); // A-Z
}

export function validateSKU(sku: string): boolean {
  const pattern = /^[A-Z]{3}-[A-Z]{3}-\d{4}-[A-Z]$/;
  if (!pattern.test(sku)) return false;

  const parts = sku.split('-');
  const body = `${parts[0]}${parts[1]}${parts[2]}`;
  const expectedCheck = generateChecksum(body);
  return parts[3] === expectedCheck;
}

export function parseSKU(sku: string) {
  const [category, subCategory, sequence, checksum] = sku.split('-');
  return { category, subCategory, sequence: parseInt(sequence), checksum };
}
```

### Barcode System

Garage WMS mendukung **5 format barcode** untuk fleksibilitas maksimal:

| Format | Penggunaan | Contoh |
|--------|-----------|--------|
| **Code 128** | SKU internal produk | `BVR-COF-0001-A` |
| **QR Code** | Batch info lengkap + URL | JSON payload |
| **EAN-13** | Barcode supplier / produk retail | `8990123456789` |
| **DataMatrix** | Label kecil (packaging, dll) | Compact data |
| **Code 39** | Dokumen internal (PO, Transfer) | `TRF-20261201-001` |

### Barcode Generator Component

```typescript
// components/barcode/BarcodeGenerator.tsx
'use client';

import { useEffect, useRef } from 'react';
import bwipjs from 'bwip-js';
import { motion } from 'framer-motion';

interface BarcodeGeneratorProps {
  value: string;
  format?: 'code128' | 'qrcode' | 'ean13' | 'datamatrix';
  width?: number;
  height?: number;
  showLabel?: boolean;
  label?: string;
  animate?: boolean;
}

export function BarcodeGenerator({
  value,
  format = 'code128',
  width = 2,
  height = 12,
  showLabel = true,
  label,
  animate = true
}: BarcodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: format,
        text: value,
        scale: width,
        height: height,
        includetext: showLabel,
        textxalign: 'center',
        textsize: 10,
        textyoffset: 4,
      });
    } catch (e) {
      console.error('Barcode error:', e);
    }
  }, [value, format, width, height, showLabel]);

  return (
    <motion.div
      className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-border"
      initial={animate ? { opacity: 0, scale: 0.9 } : false}
      animate={animate ? { opacity: 1, scale: 1 } : false}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <canvas ref={canvasRef} className="max-w-full" />
      {label && (
        <p className="text-xs font-mono text-text-secondary">{label}</p>
      )}
    </motion.div>
  );
}
```

### Barcode Scanner Component

```typescript
// components/barcode/BarcodeScanner.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/browser';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, CheckCircle, XCircle } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onError?: (error: Error) => void;
  autoStop?: boolean;
}

export function BarcodeScanner({ onScan, onError, autoStop = true }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'scanning' | 'success' | 'error'>('scanning');
  const [lastResult, setLastResult] = useState<string>('');
  const codeReaderRef = useRef<BrowserMultiFormatReader>();

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    codeReader.decodeFromVideoDevice(undefined, videoRef.current!, (result, error) => {
      if (result) {
        const text = result.getText();
        setLastResult(text);
        setStatus('success');
        onScan(text);

        if (autoStop) {
          setTimeout(() => {
            codeReader.reset();
            setStatus('scanning');
          }, 2000);
        }
      }
      if (error && !(error instanceof NotFoundException)) {
        setStatus('error');
        onError?.(error as Error);
      }
    });

    return () => { codeReader.reset(); };
  }, []);

  return (
    <div className="relative w-full max-w-sm mx-auto overflow-hidden rounded-xl border-2 border-graphite bg-black aspect-[4/3]">
      <video ref={videoRef} className="w-full h-full object-cover" />

      {/* Scan Line Animation */}
      <motion.div
        className="absolute left-4 right-4 h-0.5 bg-garage-red shadow-[0_0_8px_#C8102E]"
        animate={{ top: ['20%', '80%', '20%'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Corner brackets */}
      {['tl', 'tr', 'bl', 'br'].map((corner) => (
        <div
          key={corner}
          className={`absolute w-6 h-6 border-garage-red border-2
            ${corner === 'tl' ? 'top-4 left-4 border-r-0 border-b-0 rounded-tl' : ''}
            ${corner === 'tr' ? 'top-4 right-4 border-l-0 border-b-0 rounded-tr' : ''}
            ${corner === 'bl' ? 'bottom-4 left-4 border-r-0 border-t-0 rounded-bl' : ''}
            ${corner === 'br' ? 'bottom-4 right-4 border-l-0 border-t-0 rounded-br' : ''}
          `}
        />
      ))}

      {/* Status Overlay */}
      <AnimatePresence>
        {status === 'success' && (
          <motion.div
            className="absolute inset-0 bg-green-500/20 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <CheckCircle className="w-16 h-16 text-green-400" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result */}
      {lastResult && (
        <div className="absolute bottom-0 inset-x-0 bg-graphite/90 p-3">
          <p className="text-white text-sm font-mono text-center truncate">{lastResult}</p>
        </div>
      )}
    </div>
  );
}
```

### Label Printing Format

```typescript
// Label A6 untuk produk (57mm × 38mm)
interface ProductLabel {
  sku: string;               // BVR-COF-0001-A
  name: string;              // Arabica Gayo 1kg
  batchNumber: string;       // BTH-2026-0142
  expiryDate: Date;          // 31 Dec 2026
  warehouseCode: string;     // WH-01-RACK-A3
  unit: string;              // kg
  costPrice: number;         // HPP per unit
  barcode: string;           // Code128 dari SKU
  qrPayload: string;         // JSON: full item info
}
```

---

## 6. Struktur Folder Next.js

```
garage-wms/
├── app/                                # Next.js App Router
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Root dashboard layout (sidebar)
│   │   ├── page.tsx                    # Dashboard / home
│   │   ├── inventory/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   ├── scan/
│   │   │   │   └── page.tsx
│   │   │   └── label/
│   │   │       └── [id]/page.tsx       # Print label
│   │   ├── receiving/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── transfer/
│   │   ├── supplier/
│   │   ├── kitchen/
│   │   ├── bar/
│   │   ├── recipe/
│   │   ├── production/
│   │   ├── stock-opname/
│   │   ├── adjustment/
│   │   ├── reports/
│   │   │   ├── page.tsx
│   │   │   ├── stock-card/
│   │   │   ├── movement/
│   │   │   ├── expired/
│   │   │   ├── waste/
│   │   │   ├── abc-analysis/
│   │   │   └── cost/
│   │   └── settings/
│   └── api/
│       └── [...proxy]/
│           └── route.ts
│
├── components/
│   ├── ui/                             # Base components (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   ├── select.tsx
│   │   └── ...
│   ├── barcode/
│   │   ├── BarcodeGenerator.tsx
│   │   ├── BarcodeScanner.tsx
│   │   ├── QRGenerator.tsx
│   │   ├── LabelPreview.tsx
│   │   └── LabelPrint.tsx
│   ├── dashboard/
│   │   ├── KPICard.tsx
│   │   ├── StockChart.tsx
│   │   ├── AlertFeed.tsx
│   │   ├── ActivityStream.tsx
│   │   └── WarehouseMap.tsx
│   ├── inventory/
│   │   ├── ProductTable.tsx
│   │   ├── ProductCard.tsx
│   │   ├── StockBadge.tsx
│   │   ├── BatchList.tsx
│   │   └── ExpiryBadge.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── PageHeader.tsx
│   │   └── Breadcrumb.tsx
│   ├── animation/
│   │   ├── PageTransition.tsx
│   │   ├── FadeIn.tsx
│   │   ├── CountUp.tsx
│   │   ├── SlideIn.tsx
│   │   └── StaggerList.tsx
│   └── shared/
│       ├── DataTable.tsx
│       ├── SearchInput.tsx
│       ├── FilterBar.tsx
│       ├── EmptyState.tsx
│       ├── StatusDot.tsx
│       └── ConfirmDialog.tsx
│
├── lib/
│   ├── api.ts                          # API client (fetch wrapper)
│   ├── sku.ts                          # SKU generator & validator
│   ├── barcode.ts                      # Barcode utilities
│   ├── format.ts                       # Currency, date, number format
│   ├── auth.ts                         # Auth helpers
│   ├── constants.ts                    # App constants
│   └── utils.ts                        # General utilities
│
├── hooks/
│   ├── useInventory.ts
│   ├── useScan.ts                      # Barcode scan hook
│   ├── useRealtime.ts                  # WebSocket hook
│   ├── useKPI.ts                       # Dashboard KPI
│   ├── usePrint.ts                     # Label print hook
│   └── useAuth.ts
│
├── stores/
│   ├── auth.store.ts                   # Zustand auth state
│   ├── ui.store.ts                     # Sidebar, modals, toasts
│   └── scan.store.ts                   # Scan session state
│
├── types/
│   ├── inventory.ts
│   ├── supplier.ts
│   ├── receiving.ts
│   ├── transfer.ts
│   ├── recipe.ts
│   ├── production.ts
│   ├── reports.ts
│   └── auth.ts
│
├── public/
│   ├── fonts/
│   ├── lottie/                         # Lottie animation files
│   │   ├── loading-warehouse.json
│   │   ├── scan-success.json
│   │   ├── empty-box.json
│   │   └── check-success.json
│   └── images/
│
├── middleware.ts                       # Auth middleware (route protection)
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

---

## 7. Modul Sistem (12 Modul)

### Modul 01 — Master Data (P0 · Core)

> Fondasi seluruh sistem. Semua data referensi disimpan di sini.

**Entities:**
- **Product** — nama, SKU, kategori, unit, min stock, HPP, barcode, gambar
- **Category** — hierarki 2 level (kategori + sub-kategori)
- **Unit of Measure** — satuan dasar & konversi (kg, g, liter, ml, pcs, box, carton)
- **Warehouse** — lokasi gudang, type (main/kitchen/bar/outlet)
- **Rack / Location** — rak, zona, posisi dalam warehouse
- **Supplier** — profil, kontak, bank, lead time, payment terms
- **Employee** — profil staff, role, akses outlet

**Key Features:**
```
✅ SKU auto-generate saat produk baru dibuat
✅ Barcode generate otomatis (Code128 dari SKU)
✅ QR Code label print-ready
✅ Unit conversion rules (1 carton = 24 pcs, dll)
✅ Minimum stock threshold per warehouse
✅ Product photo upload ke S3
✅ Bulk import via Excel template
```

---

### Modul 02 — Inventory Management (P0 · Core)

> Real-time stock tracking dengan batch management & FEFO.

**Core Concepts:**
```
FIFO = First In, First Out   (default untuk non-perishable)
FEFO = First Expired, First Out  (default untuk F&B)
Batch = Satu lot penerimaan dengan tanggal expired yang sama
```

**Stock States:**
| State | Kondisi | Warna |
|-------|---------|-------|
| `IN_STOCK` | qty > min_stock | 🟢 Green |
| `LOW_STOCK` | 0 < qty ≤ min_stock | 🟡 Amber |
| `OUT_OF_STOCK` | qty = 0 | 🔴 Red |
| `OVERSTOCK` | qty > max_stock | 🔵 Blue |
| `EXPIRING_SOON` | expired ≤ 7 hari | 🟠 Orange |
| `EXPIRED` | expired < today | ⚫ Dark Red |

**Key Features:**
```
✅ Real-time stock per warehouse & per batch
✅ FEFO auto-sorting pada picking
✅ Batch tracking (batch number, expired date, supplier)
✅ Barcode scan untuk cari & update produk
✅ Stock history & movement log
✅ Expiry alert (7 hari, 3 hari, expired)
✅ Min/max stock alert (push notification ready)
✅ Multi-unit display (tampil qty dalam berbagai unit)
```

---

### Modul 03 — Receiving (P0 · Core)

> Alur penerimaan barang dari supplier dengan QC dan put-away.

**Alur Lengkap:**
```
[Purchase Order] → [Jadwal Delivery] → [Barang Datang]
       ↓
[Receiving Form] — scan PO number / barcode
       ↓
[QC Check] — verifikasi qty, kondisi, kesesuaian PO
       ↓
[Batch & Expired Input] — input batch number & tgl expired tiap item
       ↓
[Put Away] — tentukan rack / lokasi penyimpanan
       ↓
[Confirm] → Stok otomatis bertambah + audit log
```

**Key Features:**
```
✅ Link ke Purchase Order
✅ Camera scan: scan QR/barcode PO atau produk
✅ Partial receiving (barang datang sebagian)
✅ Discrepancy flag (qty tidak sesuai PO)
✅ QC reject → return ke supplier
✅ Auto batch number generate jika tidak ada
✅ Print label setelah receiving
✅ Supplier invoice attachment (foto/PDF)
```

---

### Modul 04 — Stock Transfer (P0 · Core)

> Pergerakan stok antar warehouse/outlet dengan approval flow.

**Transfer Types:**
| Type | Dari → Ke | Contoh |
|------|-----------|--------|
| `WAREHOUSE_TO_KITCHEN` | Gudang → Dapur | Daily pick |
| `WAREHOUSE_TO_BAR` | Gudang → Bar | Daily pick |
| `WAREHOUSE_TO_WAREHOUSE` | Gudang A → Gudang B | Rebalancing |
| `WAREHOUSE_TO_OUTLET` | Gudang Pusat → Outlet | Distribution |

**Approval Flow:**
```
Staff buat request → Manager review → Approve/Reject
       ↓ (jika Approve)
Picker terima tugas → Scan & pick item (FEFO)
       ↓
Transfer dikirim → Penerima konfirmasi
       ↓
Stok source berkurang + Stok destination bertambah
```

---

### Modul 05 — Supplier Management (P0 · Core)

```
Supplier Profile:
  ├── Info Perusahaan (nama, NPWP, alamat)
  ├── Kontak (PIC, telepon, email, WhatsApp)
  ├── Bank (nama bank, nomor rekening, atas nama)
  ├── Terms (payment terms, lead time rata-rata)
  ├── Product List (produk apa saja yang disupply)
  └── Performance Metrics:
       ├── On-time delivery rate
       ├── Quality reject rate
       ├── Average lead time
       └── Rating (1–5 bintang)
```

---

### Modul 06 — Kitchen Module (P1 · Operations)

```
Kitchen Head buat Request
  ↓ (pilih menu/resep atau manual input)
Warehouse Manager review & approve
  ↓
Warehouse Staff picking (FEFO auto-suggest)
  ↓
Transfer ke Kitchen dicatat
  ↓
Kitchen Head konfirmasi penerimaan
  ↓
Kitchen Stock update otomatis
```

**Kitchen Stock:** Kitchen memiliki "sub-inventory" sendiri — stok yang sudah di kitchen tapi belum digunakan.

---

### Modul 07 — Bar Module (P1 · Operations)

> Identik dengan Kitchen Module, khusus untuk bar area.

```
Bar Stock tracking meliputi:
  ├── Minuman ready-to-serve
  ├── Bahan baku bar (syrup, creamer, dll)
  ├── Consumables (sedotan, cup, tutup)
  └── Garnish & fresh ingredients
```

---

### Modul 08 — Recipe Management (P1 · Operations)

> Manajemen resep sebagai basis food cost calculation.

**Recipe Structure:**
```typescript
interface Recipe {
  id: string;
  name: string;               // "Caramel Macchiato"
  category: RecipeCategory;   // FOOD | BEVERAGE | MODIFIER | SEMI_FINISHED
  version: number;            // versioning resep
  yield: number;              // hasil produksi (qty)
  yieldUnit: string;          // "cup" | "porsi" | "gram"
  ingredients: RecipeIngredient[];
  laborCost: number;          // biaya tenaga kerja
  overheadCost: number;       // overhead per unit
  sellingPrice?: number;      // harga jual (opsional)
  foodCostPct?: number;       // food cost % (auto-calc)
}

interface RecipeIngredient {
  productId: string;
  quantity: number;
  unit: string;
  wasteFactor: number;        // 0.05 = 5% waste allowance
  actualCost: number;         // auto-calc dari HPP produk
}
```

**Auto-calculations:**
```
Total COGS = Σ(qty × HPP per unit × (1 + waste_factor)) + labor + overhead
Food Cost % = (Total COGS / Selling Price) × 100
Target Food Cost: < 35% untuk beverage, < 40% untuk food
```

---

### Modul 09 — Production (P1 · Operations)

> Raw material → Production process → Finished goods.

**Contoh Use Case:**
```
Input:  Arabica Gayo 100g + Air 200ml + Susu 150ml
        ↓ [Proses: Brewing + Steaming]
Output: Cold Brew Concentrate 300ml (semi-finished)
        → Masuk ke inventory sebagai produk baru
```

**Production Order Flow:**
```
Buat Production Order (pilih recipe, qty target)
  ↓
Reservasi raw materials (stok di-lock)
  ↓
Produksi berjalan (status: IN_PRODUCTION)
  ↓
Input hasil produksi (qty actual + QC)
  ↓
Finished goods masuk inventory
  ↓
Raw material berkurang + Finished goods bertambah
```

---

### Modul 10 — Stock Opname (P1 · Control)

> Penghitungan fisik stok berkala untuk rekonsiliasi.

```
Buat Sesi Opname (pilih warehouse, tanggal, tim)
  ↓
Generate Count Sheet (daftar semua produk + expected qty)
  ↓
Counting (staff input qty fisik, bisa scan barcode)
  ↓
System hitung variance (fisik vs sistem)
  ↓
Manager review variance — approve / investigate
  ↓
Adjustment otomatis (stok sistem = stok fisik)
  ↓
Variance report & audit log
```

**Variance Handling:**
| Variance | Aksi |
|----------|------|
| ≤ 1% | Auto-approve |
| 1–5% | Butuh approval manager |
| > 5% | Investigasi wajib + approval owner |

---

### Modul 11 — Adjustment & Waste (P1 · Control)

**Waste Categories:**
```
SPOILAGE     — Bahan basi / rusak
SPILLAGE     — Tumpah / kecelakaan
EXPIRED      — Melewati tanggal expired
OVER_PORTION — Porsi berlebih
PRODUCTION   — Waste dari proses produksi
TESTING      — Testing/sampling
THEFT        — Kehilangan (butuh approval khusus)
OTHER        — Lainnya (wajib isi keterangan)
```

**Adjustment Types:**
```
INCREASE — Stok bertambah (temuan stok, koreksi, dll)
DECREASE — Stok berkurang (koreksi kelebihan, dll)
```

---

### Modul 12 — Reports & Analytics (P2 · System)

**15 Jenis Laporan:**

| Laporan | Deskripsi | Export |
|---------|-----------|--------|
| Stock Card | Mutasi stok per produk | Excel, PDF |
| Stock Movement | Semua pergerakan stok | Excel, PDF |
| Expired Report | Item mendekati/sudah expired | Excel |
| Waste Report | Total waste per kategori | Excel, PDF |
| Supplier Performance | Rating & on-time delivery | PDF |
| Kitchen Consumption | Pemakaian bahan dapur | Excel, PDF |
| Bar Consumption | Pemakaian bahan bar | Excel, PDF |
| Recipe Cost | COGS per resep | PDF |
| Production Report | Output produksi vs target | Excel |
| Inventory Valuation | Nilai stok (HPP, FIFO, weighted avg) | Excel |
| ABC Analysis | Klasifikasi produk A/B/C | PDF |
| Fast Moving | Produk paling cepat habis | PDF |
| Slow Moving | Produk lambat keluar (dead stock risk) | PDF |
| Dead Stock | Stok tidak bergerak > 30 hari | Excel |
| Audit Trail | Log semua transaksi | Excel |

---

## 8. Database Schema

```sql
-- ============================================
-- MASTER DATA
-- ============================================

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(10) UNIQUE NOT NULL,       -- BVR, FNB, PKG...
  name        VARCHAR(100) NOT NULL,
  parent_id   UUID REFERENCES categories(id),    -- untuk sub-kategori
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(50) NOT NULL,           -- kilogram, gram, liter...
  abbreviation    VARCHAR(10) NOT NULL,            -- kg, g, L, ml, pcs
  base_unit_id    UUID REFERENCES units(id),      -- unit dasar (gram untuk kg)
  conversion_factor DECIMAL(15,6),                -- 1 kg = 1000 g
  is_active       BOOLEAN DEFAULT true
);

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             VARCHAR(20) UNIQUE NOT NULL,    -- BVR-COF-0001-A
  barcode         VARCHAR(50),                    -- supplier barcode (EAN13)
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category_id     UUID NOT NULL REFERENCES categories(id),
  base_unit_id    UUID NOT NULL REFERENCES units(id),
  image_url       TEXT,
  min_stock       DECIMAL(15,3) DEFAULT 0,
  max_stock       DECIMAL(15,3),
  reorder_point   DECIMAL(15,3),
  is_perishable   BOOLEAN DEFAULT false,
  track_batch     BOOLEAN DEFAULT false,
  is_produced     BOOLEAN DEFAULT false,          -- dibuat sendiri (semi-finished)
  cost_method     VARCHAR(20) DEFAULT 'WEIGHTED_AVG', -- FIFO | WEIGHTED_AVG
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(10) UNIQUE NOT NULL,        -- WH-01, KIT-01, BAR-01
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20) NOT NULL,               -- MAIN | KITCHEN | BAR | OUTLET
  address     TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE racks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  code          VARCHAR(20) NOT NULL,             -- A1, B3, FREEZER-1
  name          VARCHAR(100),
  zone          VARCHAR(50),                      -- DRY | CHILLED | FROZEN
  capacity      DECIMAL(15,3),
  is_active     BOOLEAN DEFAULT true
);

-- ============================================
-- INVENTORY
-- ============================================

CREATE TABLE stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  rack_id       UUID REFERENCES racks(id),
  qty           DECIMAL(15,3) NOT NULL DEFAULT 0,
  unit_id       UUID NOT NULL REFERENCES units(id),
  avg_cost      DECIMAL(15,4) DEFAULT 0,         -- HPP rata-rata (weighted avg)
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);

CREATE TABLE batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number    VARCHAR(50) NOT NULL,           -- BTH-2026-0142
  product_id      UUID NOT NULL REFERENCES products(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  rack_id         UUID REFERENCES racks(id),
  qty             DECIMAL(15,3) NOT NULL,
  unit_id         UUID NOT NULL REFERENCES units(id),
  cost_price      DECIMAL(15,4) NOT NULL,
  manufactured_at DATE,
  expired_at      DATE,
  received_at     TIMESTAMPTZ DEFAULT now(),
  status          VARCHAR(20) DEFAULT 'ACTIVE',   -- ACTIVE | DEPLETED | EXPIRED | QUARANTINE
  supplier_id     UUID REFERENCES suppliers(id),
  notes           TEXT
);

CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  batch_id        UUID REFERENCES batches(id),
  movement_type   VARCHAR(30) NOT NULL,          -- RECEIVE | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT | WASTE | PRODUCTION
  reference_type  VARCHAR(30),                   -- RECEIVING | TRANSFER | OPNAME | ADJUSTMENT | PRODUCTION
  reference_id    UUID,                          -- FK ke dokumen sumber
  qty_before      DECIMAL(15,3) NOT NULL,
  qty_change      DECIMAL(15,3) NOT NULL,        -- positif = masuk, negatif = keluar
  qty_after       DECIMAL(15,3) NOT NULL,
  unit_id         UUID NOT NULL REFERENCES units(id),
  cost_price      DECIMAL(15,4),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  notes           TEXT
);

-- ============================================
-- RECEIVING
-- ============================================

CREATE TABLE receiving_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number      VARCHAR(30) UNIQUE NOT NULL,   -- RCV-20261201-001
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  status          VARCHAR(20) DEFAULT 'DRAFT',   -- DRAFT | IN_PROGRESS | COMPLETED | CANCELLED
  received_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES users(id),
  notes           TEXT
);

CREATE TABLE receiving_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_order_id  UUID NOT NULL REFERENCES receiving_orders(id),
  product_id          UUID NOT NULL REFERENCES products(id),
  batch_number        VARCHAR(50),
  qty_ordered         DECIMAL(15,3),
  qty_received        DECIMAL(15,3) NOT NULL,
  unit_id             UUID NOT NULL REFERENCES units(id),
  cost_price          DECIMAL(15,4) NOT NULL,
  expired_at          DATE,
  rack_id             UUID REFERENCES racks(id),
  qc_status           VARCHAR(20) DEFAULT 'PASS',   -- PASS | FAIL | PARTIAL
  notes               TEXT
);

-- ============================================
-- TRANSFER
-- ============================================

CREATE TABLE transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number      VARCHAR(30) UNIQUE NOT NULL,   -- TRF-20261201-001
  transfer_type   VARCHAR(30) NOT NULL,
  from_warehouse  UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse    UUID NOT NULL REFERENCES warehouses(id),
  status          VARCHAR(20) DEFAULT 'PENDING', -- PENDING | APPROVED | PICKING | SENT | RECEIVED | CANCELLED
  requested_by    UUID NOT NULL REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  requested_at    TIMESTAMPTZ DEFAULT now(),
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  notes           TEXT
);

CREATE TABLE transfer_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id     UUID NOT NULL REFERENCES transfers(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  batch_id        UUID REFERENCES batches(id),
  qty_requested   DECIMAL(15,3) NOT NULL,
  qty_picked      DECIMAL(15,3),
  qty_received    DECIMAL(15,3),
  unit_id         UUID NOT NULL REFERENCES units(id),
  cost_price      DECIMAL(15,4)
);

-- ============================================
-- AUTH & USERS
-- ============================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(200) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            VARCHAR(100) NOT NULL,
  role            VARCHAR(30) NOT NULL,          -- SUPER_ADMIN | OWNER | MANAGER | STAFF | KITCHEN_HEAD | BAR_HEAD
  warehouse_ids   UUID[],                        -- akses warehouse
  is_active       BOOLEAN DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  action          VARCHAR(50) NOT NULL,          -- CREATE | UPDATE | DELETE | VIEW | APPROVE | REJECT
  entity_type     VARCHAR(50) NOT NULL,          -- Product | Stock | Transfer | etc
  entity_id       UUID NOT NULL,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 9. API Routes & Endpoints

### Base URL: `https://api.garage-wms.com/v1`

### Authentication

```
POST   /auth/login              Masuk dengan email & password
POST   /auth/refresh            Refresh access token
POST   /auth/logout             Logout (revoke refresh token)
GET    /auth/me                 Get current user profile
```

### Inventory

```
GET    /inventory               List semua produk + stock level
GET    /inventory/:id           Detail produk + semua batch
GET    /inventory/sku/:sku      Cari produk berdasarkan SKU
GET    /inventory/barcode/:code Scan & cari produk
GET    /inventory/:id/movements Stock movement history
GET    /inventory/alerts        Low stock + expiry alerts
POST   /inventory/products      Buat produk baru (generate SKU otomatis)
PATCH  /inventory/products/:id  Update info produk
GET    /inventory/batches       List semua batch aktif
GET    /inventory/batches/fefo  FEFO sorted list untuk picking
```

### Receiving

```
GET    /receiving               List semua receiving order
POST   /receiving               Buat receiving order baru
GET    /receiving/:id           Detail receiving order
PATCH  /receiving/:id           Update (tambah item, ubah qty)
POST   /receiving/:id/complete  Finalize → stok bertambah
POST   /receiving/:id/cancel    Batalkan receiving
```

### Transfer

```
GET    /transfers               List transfer (filter by status, type)
POST   /transfers               Buat transfer request
GET    /transfers/:id           Detail transfer
POST   /transfers/:id/approve   Manager approve
POST   /transfers/:id/reject    Manager reject
POST   /transfers/:id/pick      Update picking progress
POST   /transfers/:id/send      Tandai sudah dikirim
POST   /transfers/:id/receive   Penerima konfirmasi
```

### SKU & Barcode

```
POST   /sku/generate            Generate SKU baru
POST   /sku/validate            Validasi SKU format + checksum
GET    /barcode/:code           Lookup produk by barcode (semua format)
POST   /labels/generate         Generate label batch (PDF)
POST   /labels/print            Send ke printer
```

### Dashboard & Reports

```
GET    /dashboard/kpi           Semua KPI real-time
GET    /dashboard/alerts        Active alerts (low stock, expiry, dll)
GET    /reports/stock-card      Stock card report (filter by date, product)
GET    /reports/movement        Movement report
GET    /reports/expired         Expired & near-expiry report
GET    /reports/waste           Waste report
GET    /reports/abc-analysis    ABC analysis
POST   /reports/export          Export ke PDF/Excel
```

### WebSocket Events (Socket.io)

```typescript
// Client subscribe ke namespace /warehouse

// Events yang diterima client:
'stock:updated'     → { productId, warehouseId, newQty, prevQty }
'alert:low-stock'   → { productId, name, currentQty, minStock }
'alert:expiry'      → { batchId, productName, expiryDate, daysLeft }
'alert:out-of-stock' → { productId, name, warehouseId }
'transfer:status'   → { transferId, newStatus, updatedBy }
'receiving:completed' → { receivingId, itemCount, totalValue }
'dashboard:refresh' → trigger dashboard KPI re-fetch
```

---

## 10. Komponen UI Utama

### KPI Card dengan CountUp Animation

```typescript
// components/dashboard/KPICard.tsx
'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number;
  previousValue?: number;
  format?: 'number' | 'currency' | 'percent';
  unit?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'critical' | 'success';
  delay?: number;
}

export function KPICard({
  title, value, previousValue, format = 'number',
  unit, icon, variant = 'default', delay = 0
}: KPICardProps) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 1200, bounce: 0 });
  const displayValue = useTransform(spring, (v) => formatValue(v, format));

  useEffect(() => {
    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [value]);

  const trend = previousValue !== undefined
    ? value > previousValue ? 'up'
    : value < previousValue ? 'down' : 'flat'
    : null;

  const variantStyles = {
    default:  'border-border',
    warning:  'border-amber-200 bg-amber-50/50',
    critical: 'border-red-200 bg-red-50/50',
    success:  'border-green-200 bg-green-50/50',
  };

  return (
    <motion.div
      className={`bg-white rounded-xl border p-5 ${variantStyles[variant]}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 bg-garage-red-10 rounded-lg text-garage-red">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend === 'up' ? 'text-green-600' :
            trend === 'down' ? 'text-red-600' : 'text-text-muted'
          }`}>
            {trend === 'up' ? <TrendingUp size={12} /> :
             trend === 'down' ? <TrendingDown size={12} /> :
             <Minus size={12} />}
            {previousValue ? Math.abs(((value - previousValue) / previousValue) * 100).toFixed(1) + '%' : ''}
          </div>
        )}
      </div>
      <motion.p className="text-3xl font-bold text-text-primary tracking-tight">
        {displayValue}
        {unit && <span className="text-lg font-medium text-text-muted ml-1">{unit}</span>}
      </motion.p>
      <p className="text-sm text-text-secondary mt-1">{title}</p>
    </motion.div>
  );
}
```

### Data Table dengan Animasi

```typescript
// components/shared/DataTable.tsx
// Animated table dengan sort, filter, pagination
// Setiap baris masuk dengan stagger animation

import { motion, AnimatePresence } from 'framer-motion';

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, duration: 0.25, ease: 'easeOut' }
  }),
  exit: { opacity: 0, x: 10, transition: { duration: 0.15 } }
};
```

### Stock Badge

```typescript
// components/inventory/StockBadge.tsx
const stockConfig = {
  IN_STOCK:      { label: 'In Stock',       className: 'bg-green-100 text-green-700' },
  LOW_STOCK:     { label: 'Low Stock',      className: 'bg-amber-100 text-amber-700' },
  OUT_OF_STOCK:  { label: 'Out of Stock',   className: 'bg-red-100 text-red-700' },
  EXPIRING_SOON: { label: 'Expiring Soon',  className: 'bg-orange-100 text-orange-700' },
  EXPIRED:       { label: 'Expired',        className: 'bg-gray-800 text-white' },
};
```

---

## 11. Animation Playbook

> Panduan lengkap penggunaan animasi di Garage WMS. **Animasi harus membantu UX, bukan mengganggu.**

### Prinsip Animasi

```
1. PURPOSEFUL    — Setiap animasi punya tujuan (guide attention, confirm action)
2. FAST          — Max 400ms untuk micro-interactions, 600ms untuk page transitions
3. SPRING        — Gunakan spring physics untuk feel yang natural
4. REDUCED MOTION — Semua animasi respek prefers-reduced-motion
5. PERFORMANT    — CSS transform only, no layout-triggering props
```

### Page Transitions

```typescript
// components/animation/PageTransition.tsx
// Digunakan di setiap halaman utama

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } }
};
```

### Micro-interactions Catalog

| Elemen | Animasi | Duration | Library |
|--------|---------|----------|---------|
| Button hover | Scale 1.02 + shadow | 150ms | Framer |
| Button click | Scale 0.97 | 100ms | Framer |
| Card hover | Y -2px + shadow | 200ms | Framer |
| KPI number | Count up dari 0 | 1200ms | Framer spring |
| Table rows | Stagger fade in (40ms delay) | 250ms ea | Framer |
| Sidebar menu | Slide in from left | 300ms | Framer |
| Modal open | Scale 0.95→1 + fade | 300ms | Framer |
| Toast | Slide from right | 350ms | Framer |
| Badge pulse | Pulse ring (low stock) | 2s loop | CSS |
| Scan success | Scale + green flash | 500ms | Framer + Lottie |
| Scan line | Vertical scan | 2.5s loop | Framer |
| Loading | Warehouse Lottie | Loop | Lottie |
| Empty state | Box animation | Loop | Lottie |
| Number update | Flash + scale | 400ms | Framer |
| Status change | Color transition | 300ms | CSS transition |

### Critical Alert Animation

```typescript
// Untuk Low Stock & Out of Stock badge
// CSS pulse ring animation

@keyframes ping {
  0%   { transform: scale(1); opacity: 1; }
  75%, 100% { transform: scale(2); opacity: 0; }
}

.alert-pulse::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: currentColor;
  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
  opacity: 0.3;
}
```

### Scan Effect (GSAP)

```typescript
// Efek khusus saat barcode berhasil di-scan
// Green flash + ripple dari titik scan

gsap.timeline()
  .to(overlayRef.current, { backgroundColor: 'rgba(22,163,74,0.3)', duration: 0.1 })
  .to(overlayRef.current, { backgroundColor: 'transparent', duration: 0.4 })
  .fromTo(rippleRef.current,
    { scale: 0, opacity: 1 },
    { scale: 3, opacity: 0, duration: 0.6, ease: 'power2.out' }
  );
```

### Reduced Motion

```typescript
// Selalu check prefers-reduced-motion
import { useReducedMotion } from 'framer-motion';

function useAnimationConfig() {
  const shouldReduceMotion = useReducedMotion();
  return shouldReduceMotion
    ? { initial: false, animate: false }  // No animation
    : { initial: 'initial', animate: 'enter', exit: 'exit' };
}
```

---

## 12. Security & RBAC

### Permission Matrix

| Permission | Super Admin | Owner | Manager | Staff | Kitchen Head | Bar Head |
|------------|:-----------:|:-----:|:-------:|:-----:|:------------:|:--------:|
| Dashboard view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventory view | ✅ | ✅ | ✅ | ✅ | — | — |
| Inventory edit | ✅ | — | ✅ | — | — | — |
| Receiving create | ✅ | — | ✅ | ✅ | — | — |
| Receiving approve | ✅ | — | ✅ | — | — | — |
| Transfer request | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Transfer approve | ✅ | — | ✅ | — | — | — |
| Adjustment create | ✅ | — | ✅ | ✅ | — | — |
| Adjustment approve | ✅ | — | ✅ | — | — | — |
| Waste record | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Recipe view | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Recipe edit | ✅ | — | ✅ | — | — | — |
| Reports view | ✅ | ✅ | ✅ | — | — | — |
| Reports export | ✅ | ✅ | ✅ | — | — | — |
| User management | ✅ | — | — | — | — | — |
| System settings | ✅ | — | — | — | — | — |

### Security Implementation

```typescript
// middleware.ts — Route protection

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await verifyJWT(token);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.sub);
    requestHeaders.set('x-user-role', payload.role);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/(dashboard)/:path*']
};
```

### Audit Trail

```typescript
// Setiap operasi mutasi (CREATE, UPDATE, DELETE, APPROVE)
// dicatat otomatis ke tabel audit_logs via NestJS interceptor

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const { user, body, method, url } = request;

    return next.handle().pipe(
      tap(async (data) => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
          await this.auditService.log({
            userId: user.id,
            action: method,
            entityType: this.extractEntityType(url),
            entityId: data?.id,
            newData: body,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          });
        }
      })
    );
  }
}
```

---

## 13. Dashboard & KPI Real-time

### Layout Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: Warehouse selector | Date | Alert bell | Profile   │
├────────────────────────────────────────────────────────────-┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Total     │  │Inventory │  │Low Stock │  │Out of    │   │
│  │Items     │  │Value     │  │Alert     │  │Stock     │   │
│  │  1,247   │  │Rp 284jt  │  │  23 item │  │  4 item  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Expired   │  │Transfer  │  │Receiving │  │Waste     │   │
│  │Today     │  │Today     │  │Today     │  │Today     │   │
│  │  2 item  │  │  8 doc   │  │  3 PO    │  │Rp 240rb  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌─────────────────────────┐  ┌────────────────────────┐   │
│  │   Stock Movement Chart  │  │   Alert Feed           │   │
│  │   (7 hari terakhir)     │  │   (real-time)          │   │
│  │   [Recharts Area]       │  │   • Low: Arabica 2kg   │   │
│  │                         │  │   • Exp: Susu UHT 3hr  │   │
│  └─────────────────────────┘  └────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────┐  ┌────────────────────────┐   │
│  │   Top 10 Slow Moving    │  │   Recent Activity      │   │
│  │   [Nivo HeatMap]        │  │   (audit stream)       │   │
│  └─────────────────────────┘  └────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Real-time Updates

```typescript
// hooks/useRealtime.ts

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket;

export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      auth: { token: getAccessToken() }
    });

    socket.on('stock:updated', ({ productId, warehouseId }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', productId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpi'] });
    });

    socket.on('alert:low-stock', (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'alerts'] });
      showToast({ type: 'warning', message: `Low stock: ${data.name}` });
    });

    socket.on('alert:out-of-stock', (data) => {
      showToast({ type: 'error', message: `OUT OF STOCK: ${data.name}` });
    });

    return () => { socket.disconnect(); };
  }, []);
}
```

---

## 14. Laporan & Analytics

### Export Implementation

```typescript
// lib/export.ts

// Excel export menggunakan SheetJS
import * as XLSX from 'xlsx';

export function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
}

// PDF export menggunakan jsPDF + autoTable
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function exportToPDF(data: Record<string, unknown>[], columns: Column[], title: string) {
  const doc = new jsPDF({ orientation: 'landscape' });

  // GARAGE header
  doc.setFillColor(47, 49, 54); // graphite
  doc.rect(0, 0, 297, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('GARAGE Warehouse', 14, 12);
  doc.setFontSize(10);
  doc.text(title, 14, 22);

  doc.autoTable({ columns, body: data, startY: 35, ... });
  doc.save(`${title}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}
```

### ABC Analysis Logic

```typescript
// lib/analytics/abc-analysis.ts
// Klasifikasi produk berdasarkan Pareto (80/20)

export function calculateABCAnalysis(products: ProductWithMovement[]) {
  // Sort by total value (qty × HPP × movement velocity)
  const sorted = products.sort((a, b) => b.totalValue - a.totalValue);
  const grandTotal = sorted.reduce((sum, p) => sum + p.totalValue, 0);

  let cumulative = 0;
  return sorted.map(product => {
    cumulative += product.totalValue;
    const cumulativePct = (cumulative / grandTotal) * 100;

    return {
      ...product,
      class: cumulativePct <= 80 ? 'A'   // Top 80% value → fokus tinggi
            : cumulativePct <= 95 ? 'B'  // 80–95% value → fokus medium
            : 'C',                        // Bottom 5% value → monitor
      cumulativePct
    };
  });
}
```

---

## 15. Deployment & DevOps

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: garage_wms
      POSTGRES_USER: garage
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: garage
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://garage:${DB_PASSWORD}@postgres:5432/garage_wms
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    depends_on: [postgres, redis]
    ports:
      - "3001:3001"

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://backend:3001
      NEXT_PUBLIC_WS_URL: ws://backend:3001
    depends_on: [backend]
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  minio_data:
```

### Environment Variables

```bash
# .env.local (Next.js)

# API
NEXT_PUBLIC_API_URL=https://api.garage-wms.com/v1
NEXT_PUBLIC_WS_URL=wss://api.garage-wms.com

# App
NEXT_PUBLIC_APP_NAME=Garage WMS
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_COMPANY=GARAGE Coffee & Motor

# Feature flags
NEXT_PUBLIC_ENABLE_BARCODE_SCAN=true
NEXT_PUBLIC_ENABLE_REALTIME=true
NEXT_PUBLIC_ENABLE_PRINT=true
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t garage-wms:${{ github.sha }} .
      - name: Push to registry
        run: docker push registry.garage-wms.com/frontend:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          ssh deploy@garage-wms.com "
            cd /app/garage-wms &&
            docker pull registry.garage-wms.com/frontend:${{ github.sha }} &&
            docker-compose up -d --no-deps frontend
          "
```

### Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.2s |
| Largest Contentful Paint | < 2.0s |
| Time to Interactive | < 3.0s |
| API response time (P95) | < 200ms |
| WebSocket latency | < 50ms |
| Lighthouse Score | > 90 |
| System Uptime | > 99.9% |

---

## 16. Roadmap & KPI Sukses

### Roadmap 3 Fase

```
VERSION 1 · Q3 2026 — Core Warehouse (MVP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Master Data (Product, Category, Unit, Warehouse, Rack, Supplier)
✅ Inventory Management + Batch + FEFO
✅ SKU Auto-generate + Barcode (Code128, QR)
✅ Receiving (PO → QC → Batch → Put Away)
✅ Stock Transfer (multi-warehouse, approval flow)
✅ Kitchen & Bar Module
✅ Recipe Management + Cost Calculation
✅ Production Module
✅ Stock Opname + Variance
✅ Adjustment & Waste Management
✅ Dashboard Real-time (WebSocket)
✅ 15 Jenis Laporan (export PDF & Excel)
✅ RBAC (6 roles)
✅ Audit Trail lengkap
✅ Label Print (A6, barcode, QR)

VERSION 2 · Q1 2027 — Mobile & Offline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 Mobile App (React Native / PWA)
📷 Camera Barcode Scanner (native)
🔔 Push Notification (FCM)
🔌 Offline Sync Mode (SQLite local)
🏪 Supplier Portal (self-service)
📋 Purchase Order Module
🌍 Multi-language (ID, EN)
📊 Advanced Dashboard Drilldown

VERSION 3 · Q3 2027 — AI & Intelligence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AI Demand Forecasting
🔄 Smart Auto-Reorder
⚠️ Predictive Expiry Alert (ML)
📈 Business Intelligence Suite
🔗 IoT Integration (sensor suhu, timbangan)
💳 POS Integration
🏢 Garage ERP Suite (full back office)
📊 Advanced Analytics & Custom Reports
```

### KPI Keberhasilan

| Metrik | Baseline | Target 6 Bulan | Target 12 Bulan |
|--------|----------|-----------------|-----------------|
| Human Error Inventory | ~15%/bulan | < 5% | < 2% |
| Waste Rate | ~8% dari purchase | < 5% | < 3% |
| Stock Accuracy | ~80% | > 95% | > 98% |
| Time Receiving (per PO) | ~45 menit | < 20 menit | < 10 menit |
| User Adoption Rate | — | > 80% aktif | > 95% aktif |
| System Uptime | — | > 99% | > 99.9% |
| Food Cost Visibility | 0% | 100% real-time | 100% + forecast |

---

## Quick Start Development

```bash
# 1. Clone & install
git clone https://github.com/garage/garage-wms
cd garage-wms
npm install

# 2. Setup environment
cp .env.example .env.local
# Edit .env.local dengan credentials kamu

# 3. Start database
docker-compose up postgres redis minio -d

# 4. Setup database
npx prisma migrate dev
npx prisma db seed

# 5. Start development
npm run dev
# → http://localhost:3000

# Default login:
# Email: admin@garage.com
# Password: garage2026!
```

---

## Checklist Claude Design

Saat membuka project ini di Claude Design, gunakan checklist ini:

```
□ Setup design tokens (CSS variables dari Design System bagian 4)
□ Install Framer Motion: npm install framer-motion
□ Install barcode libs: npm install bwip-js @zxing/browser react-barcode
□ Install charts: npm install recharts @nivo/core
□ Install animation: npm install gsap lottie-react
□ Setup Tailwind dengan custom colors (garage-red, graphite, dll)
□ Buat layout komponen: Sidebar + Header + PageTransition
□ Implement KPICard dengan CountUp animation
□ Implement BarcodeScanner dengan scan-line animation
□ Implement BarcodeGenerator dengan label preview
□ Setup WebSocket connection (useRealtime hook)
□ Buat DataTable dengan stagger row animation
□ Test semua animasi dengan prefers-reduced-motion
□ Performance audit (Lighthouse > 90)
```

---

> **Garage Warehouse** · PRD v1.0.0 · Juni 2026
> © 2026 GARAGE Coffee & Motor · Confidential & Proprietary
> *Document prepared for development handoff — Next.js 15 + Framer Motion + Claude Design*
