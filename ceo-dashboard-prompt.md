# CEO CONTROL DASHBOARD — Claude Code Prompt

## ROLE
You are a Senior Product Designer, Frontend Architect, Motion Designer, and Data Visualization Expert. Build a production-ready CEO Control Dashboard that feels like a high-end SaaS enterprise product.

---

## TASK
Build a full React + TypeScript + Tailwind CSS project called `ceo-dashboard` — a premium, futuristic, interactive executive dashboard. Run all commands from scratch. Use mock data only (no backend needed).

---

## TECH STACK (MANDATORY)
- **Framework**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS v3 with custom config
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Icons**: Lucide React
- **State**: Zustand
- **Font**: Import from Google Fonts — use `"Syne"` for headings, `"DM Sans"` for body
- **Date**: date-fns

Install all dependencies in one command after scaffolding.

---

## STEP 1 — SCAFFOLD PROJECT

```bash
npm create vite@latest ceo-dashboard -- --template react-ts
cd ceo-dashboard
npm install tailwindcss postcss autoprefixer framer-motion recharts lucide-react zustand date-fns
npx tailwindcss init -p
```

---

## STEP 2 — PROJECT STRUCTURE

Create this exact folder structure:

```
src/
├── assets/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── Layout.tsx
│   ├── cards/
│   │   ├── KPICard.tsx
│   │   ├── RiskAlertCard.tsx
│   │   └── StatMiniCard.tsx
│   ├── charts/
│   │   ├── RevenueChart.tsx
│   │   ├── SalesFunnelChart.tsx
│   │   ├── DonutChart.tsx
│   │   ├── RadialProgressChart.tsx
│   │   ├── AreaChart.tsx
│   │   └── SparklineChart.tsx
│   ├── panels/
│   │   ├── AIInsightPanel.tsx
│   │   ├── ActivityTimeline.tsx
│   │   ├── NotificationCenter.tsx
│   │   └── ControlFilterPanel.tsx
│   ├── tables/
│   │   └── DataTable.tsx
│   └── ui/
│       ├── ThemeToggle.tsx
│       ├── Badge.tsx
│       ├── SkeletonCard.tsx
│       └── GlowDot.tsx
├── pages/
│   ├── Overview.tsx
│   ├── Financial.tsx
│   ├── Sales.tsx
│   ├── Operations.tsx
│   ├── HRTeam.tsx
│   ├── Customers.tsx
│   └── RiskCenter.tsx
├── data/
│   └── mockData.ts
├── store/
│   └── dashboardStore.ts
├── hooks/
│   ├── useCounterAnimation.ts
│   └── useTheme.ts
├── types/
│   └── index.ts
├── styles/
│   └── globals.css
├── App.tsx
└── main.tsx
```

---

## STEP 3 — DESIGN SYSTEM

### `tailwind.config.js` — extend with:
```js
theme: {
  extend: {
    colors: {
      // Backgrounds
      'bg-base': '#080C14',
      'bg-surface': '#0D1321',
      'bg-card': 'rgba(255,255,255,0.04)',
      'bg-card-hover': 'rgba(255,255,255,0.07)',
      // Brand accents
      'cyan': { DEFAULT: '#00E5FF', muted: '#00E5FF33' },
      'violet': { DEFAULT: '#7C3AED', muted: '#7C3AED33' },
      'emerald': { DEFAULT: '#10B981', muted: '#10B98133' },
      'amber': { DEFAULT: '#F59E0B', muted: '#F59E0B33' },
      'rose': { DEFAULT: '#F43F5E', muted: '#F43F5E33' },
      // Status
      'status-success': '#10B981',
      'status-warning': '#F59E0B',
      'status-danger': '#F43F5E',
      'status-info': '#00E5FF',
      // Text
      'text-primary': '#F1F5F9',
      'text-secondary': '#94A3B8',
      'text-muted': '#475569',
    },
    fontFamily: {
      heading: ['Syne', 'sans-serif'],
      body: ['DM Sans', 'sans-serif'],
    },
    boxShadow: {
      'glow-cyan': '0 0 20px rgba(0,229,255,0.15), 0 0 60px rgba(0,229,255,0.05)',
      'glow-violet': '0 0 20px rgba(124,58,237,0.2)',
      'glow-emerald': '0 0 20px rgba(16,185,129,0.15)',
      'card': '0 4px 24px rgba(0,0,0,0.4)',
    },
    backdropBlur: { card: '12px' },
    animation: {
      'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      'float': 'float 6s ease-in-out infinite',
      'glow': 'glow 2s ease-in-out infinite alternate',
    },
    keyframes: {
      float: { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-6px)' } },
      glow: { from: { opacity: '0.6' }, to: { opacity: '1' } },
    },
  },
}
```

---

## STEP 4 — MOCK DATA (`src/data/mockData.ts`)

Generate realistic mock data for:

```ts
// Executive KPIs
export const kpiData = {
  totalRevenue: { value: 12_480_000, change: +18.4, trend: 'up' },
  profitMargin: { value: 34.2, change: +2.1, trend: 'up' },
  cashFlow: { value: 3_240_000, change: -4.3, trend: 'down' },
  mrr: { value: 1_040_000, change: +12.7, trend: 'up' },
  burnRate: { value: 680_000, change: +5.2, trend: 'warning' },
  companyValuation: { value: 94_000_000, change: +22.0, trend: 'up' },
  kpiHealthScore: { value: 82, change: +3, trend: 'up' },
  targetAchievement: { value: 78, change: -2, trend: 'down' },
}

// Monthly Revenue (12 months) — realistic numbers, seasonal variation
export const revenueData = [...] // Jan–Dec with revenue, expenses, profit

// Sales funnel
export const funnelData = [
  { stage: 'Leads', value: 12400 },
  { stage: 'Qualified', value: 7820 },
  { stage: 'Proposal', value: 3940 },
  { stage: 'Negotiation', value: 1870 },
  { stage: 'Closed Won', value: 940 },
]

// Department performance (7 departments)
// HR data (headcount, attendance, satisfaction)
// Risk alerts (array with level: low | medium | high | critical)
// Activity timeline (last 10 events with timestamps)
// Customer metrics (churn, NPS, CSAT, active users)
// Top performing channels (organic, paid, referral, social, email)
// AI insights (array of 5 actionable recommendations)
// Top 10 deals table (deal name, company, stage, value, owner, probability)
```

---

## STEP 5 — ZUSTAND STORE (`src/store/dashboardStore.ts`)

```ts
interface DashboardState {
  theme: 'dark' | 'light'
  activePage: string
  sidebarCollapsed: boolean
  selectedDateRange: string   // '7d' | '30d' | '90d' | '1y'
  selectedDepartment: string  // 'all' | 'sales' | 'ops' | 'hr' | ...
  notifications: Notification[]
  isLoading: boolean
  // actions: toggleTheme, setPage, toggleSidebar, setDateRange, setDepartment, markAllRead
}
```

---

## STEP 6 — COMPONENTS (implement all of these)

### `Sidebar.tsx`
- Dark glass background with blur
- Logo + company name at top
- Nav items with icons (Lucide) for: Overview, Financial, Sales, Operations, HR & Team, Customers, Risk Center
- Active state: gradient highlight + glow on left border
- Collapse/expand with Framer Motion animation (width animates 240px → 64px)
- Bottom section: user avatar, settings, logout
- On collapsed: show only icons with tooltip on hover

### `Topbar.tsx`
- Search bar (glass style, filters nav items on type)
- Date range selector (7D / 30D / 90D / 1Y) as pill buttons
- Department filter dropdown
- Notification bell with animated badge count
- Theme toggle (dark/light)
- User avatar + name + role
- Export report button (simulate: show toast "Generating report...")
- Refresh button with spinning animation on click

### `KPICard.tsx`
Props: `{ title, value, change, trend, icon, color, prefix?, suffix?, format? }`
- Glass card with border (1px rgba white 0.08)
- Number animates from 0 to value on mount (useCounterAnimation hook)
- Change indicator: green arrow up / red arrow down / amber warning
- Mini sparkline at bottom
- On hover: card lifts (y: -4px), glow appears, border brightens
- Loading state: skeleton shimmer animation
- Status color affects: icon bg, border glow, accent dot

### `RevenueChart.tsx`
- Recharts AreaChart / ComposedChart with Revenue, Expenses, Profit lines
- Custom tooltip with glass background
- Animated on mount (strokeDasharray trick)
- Time range filter updates chart with Framer Motion transition
- Gradient fill under area curves

### `SalesFunnelChart.tsx`
- Custom SVG funnel or horizontal bar funnel
- Animated bars slide in from left on mount
- Percentage conversion shown between stages
- Color gradient from violet (top) to cyan (bottom)

### `DonutChart.tsx`
- Recharts PieChart with inner label showing main metric
- Smooth animation on render
- Custom legend with color dots

### `AIInsightPanel.tsx`
- Glowing violet/cyan border panel
- "AI Executive Assistant" header with animated dot (pulsing green)
- "What should I focus on today?" section
- 5 insight cards, each with: priority icon, short title, one-line summary, action button
- Insights have types: opportunity, warning, action-needed, insight, prediction
- Staggered Framer Motion entry animation

### `RiskAlertCard.tsx`
Props: `{ title, level, description, department, timestamp }`
- Level badge: low (emerald), medium (amber), high (rose), critical (flashing red)
- Critical cards have animated pulsing border
- Expandable detail on click

### `ActivityTimeline.tsx`
- Vertical timeline with colored dots
- Each event: time, user avatar initial, action description, department tag
- Scroll reveal animation (Framer Motion whileInView)

### `DataTable.tsx`
- Top 10 deals or customers
- Sortable columns
- Status badges
- Row hover highlight
- Pagination (show 5 per page)
- Search/filter within table

### `NotificationCenter.tsx`
- Slide-in panel from right (Framer Motion)
- Grouped by: critical, warnings, info
- Mark all as read button
- Each notification has icon, title, time ago, severity color

### `ControlFilterPanel.tsx`
- Date range picker
- Department multi-select
- Region filter
- Product line filter
- Apply / Reset buttons
- Slide-down animation

---

## STEP 7 — PAGES

### `Overview.tsx` (default page)
Layout:
1. Hero section: "Good morning, [Name]" with date/time, quick summary sentence
2. KPI Grid: 8 KPICards in responsive grid (4 cols desktop, 2 tablet, 1 mobile)
3. Main Charts Row: RevenueChart (2/3 width) + DonutChart mix (1/3)
4. Secondary Row: SalesFunnel + RadialProgress cards
5. AI Insight Panel (full width)
6. Bottom Row: ActivityTimeline + RiskAlerts + DataTable

### `Financial.tsx`
- Revenue vs Expense chart (full width)
- Budget vs Actual bar chart
- P&L summary cards
- Cash runway gauge
- Cost center breakdown table
- Financial risk alerts

### `Sales.tsx`
- Pipeline value KPIs
- Funnel chart (large)
- CAC / LTV / ROAS cards
- Campaign performance table
- Top channels bar chart
- Conversion rate trend

### `Operations.tsx`
- Department performance radial charts
- Project progress table
- SLA status indicators
- Bottleneck alerts
- Resource allocation donut

### `HRTeam.tsx`
- Headcount, attendance, performance KPIs
- Hiring pipeline funnel
- Department satisfaction heatmap
- Team performance comparison bars

### `Customers.tsx`
- Active users trend
- Churn rate gauge
- NPS score display
- Support tickets status
- Customer segmentation donut
- CLV by segment

### `RiskCenter.tsx`
- Overall risk score (large gauge)
- Risk matrix grid (2x2: probability vs impact)
- All alerts listed with filters
- Compliance status checklist
- Predictive alerts section

---

## STEP 8 — HOOKS

### `useCounterAnimation.ts`
```ts
// Animates a number from 0 to target over ~1.2s on mount
// Uses requestAnimationFrame with easing (easeOutExpo)
// Returns: current display value (formatted with commas or %)
```

### `useTheme.ts`
```ts
// Reads/writes theme from Zustand store
// Applies 'dark' or 'light' class to document.documentElement
// Dark mode: all bg-base, bg-surface classes active
// Light mode: override with slate-50, white surfaces, dark text
```

---

## STEP 9 — GLOBAL CSS (`src/styles/globals.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

/* Glassmorphism utility */
.glass {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.08);
}

/* Radial gradient background */
body {
  background-color: #080C14;
  background-image:
    radial-gradient(ellipse 80% 40% at 50% -10%, rgba(0,229,255,0.07) 0%, transparent 70%),
    radial-gradient(ellipse 60% 30% at 85% 80%, rgba(124,58,237,0.06) 0%, transparent 70%);
}

/* Animated gradient border */
.gradient-border {
  position: relative;
  background: linear-gradient(#0D1321, #0D1321) padding-box,
    linear-gradient(135deg, #00E5FF, #7C3AED) border-box;
  border: 1px solid transparent;
}
```

---

## STEP 10 — `App.tsx`

```tsx
// Router: React Router v6 with routes for each page
// Wrap in <Layout> (Sidebar + Topbar)
// Framer Motion AnimatePresence for page transitions
// Page transition: opacity 0→1, y: 12→0, duration 0.3s
// Apply theme class to root div from Zustand store
```

---

## QUALITY REQUIREMENTS

- Every chart must have animated entry (staggered or stroke animation)
- Every card must have hover: `whileHover={{ y: -4, scale: 1.01 }}`
- Use `motion.div` from Framer Motion on all major sections
- Stagger children with `staggerChildren: 0.07` in container variants
- Use `AnimatePresence` for notifications, modals, filter panel
- All numbers must use `useCounterAnimation` on mount
- Loading skeleton must show for 1.5s on first render (simulate with setTimeout)
- Charts must respond to dateRange filter (filter mockData array by range)
- Sidebar must work on mobile (overlay mode below md breakpoint)
- No layout must break on 1280px, 1440px, 1920px, or 768px
- Console must be free of errors and warnings

---

## STEP 11 — README.md

Generate a complete README with:
- Project description
- Screenshots section (placeholder)
- Tech stack list
- Installation: `npm install && npm run dev`
- Build: `npm run build`
- Folder structure overview
- Feature list

---

## START COMMAND

Begin by scaffolding the Vite project, installing dependencies, setting up Tailwind config and globals.css, then build components in this order:
1. `mockData.ts` → `dashboardStore.ts` → `types/index.ts`
2. `Layout.tsx` → `Sidebar.tsx` → `Topbar.tsx`
3. `KPICard.tsx` → `RevenueChart.tsx` → `DonutChart.tsx`
4. `AIInsightPanel.tsx` → `RiskAlertCard.tsx` → `ActivityTimeline.tsx`
5. `Overview.tsx` (main page, full implementation)
6. Remaining pages: `Financial.tsx`, `Sales.tsx`, `Operations.tsx`, `HRTeam.tsx`, `Customers.tsx`, `RiskCenter.tsx`
7. `App.tsx` with routing + page transitions
8. Final polish: check all animations, responsiveness, and theming

Do NOT stop after scaffolding. Build everything end-to-end.
