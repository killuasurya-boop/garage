"use client";

import { useEffect, useState } from "react";
import { motion, animate, Variants } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Briefcase,
  Target,
  Users,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

// --- HOOKS ---

function useCountUp(end: number, duration: number = 2) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, end, {
      duration,
      ease: "easeOut",
      onUpdate(v) {
        setValue(v);
      },
    });
    return () => controls.stop();
  }, [end, duration]);

  return value;
}

// --- MOCK DATA ---

const revenueData = [
  { month: "Jan", actual: 4000, target: 4500, profit: 1200 },
  { month: "Feb", actual: 5200, target: 4500, profit: 1500 },
  { month: "Mar", actual: 4800, target: 5000, profit: 1400 },
  { month: "Apr", actual: 6100, target: 5500, profit: 1800 },
  { month: "May", actual: 6800, target: 6000, profit: 2100 },
  { month: "Jun", actual: 7500, target: 6500, profit: 2400 },
];

const topPerformers = [
  { id: 1, name: "Enterprise Software", value: 85, color: "#3b82f6" },
  { id: 2, name: "Cloud Infrastructure", value: 72, color: "#fbbf24" },
  { id: 3, name: "Consulting Services", value: 58, color: "#94a3b8" },
  { id: 4, name: "Managed Security", value: 45, color: "#1e293b" },
];

const actionItems = [
  { id: 1, text: "Approve Q3 CapEx Expansion Budget", priority: "High" },
  { id: 2, text: "Review Enterprise Churn Risk Report", priority: "High" },
  { id: 3, text: "Finalize Partner Agreement with AWS", priority: "Medium" },
  { id: 4, text: "Schedule Leadership Sync", priority: "Low" },
];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const formatChartCurrency = (val: unknown) =>
  typeof val === "number" ? formatCurrency(val) : String(val ?? "");

// --- ANIMATION VARIANTS ---

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

export default function SaasExecutiveDashboard() {
  const revValue = useCountUp(8245000, 2);
  const profitValue = useCountUp(1420000, 2);
  const customerValue = useCountUp(12450, 2);

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 selection:bg-blue-500/30">
      <div className="mx-auto max-w-[1440px] p-6 lg:p-10">
        
        {/* HEADER */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                Live Data Synchronized
              </span>
            </div>
            <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
              Executive <span className="font-semibold text-white">Summary</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Q2 2026 Performance • Last updated just now
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/10 bg-slate-900 text-xs font-semibold text-white shadow-lg">
              CEO
            </div>
          </div>
        </motion.header>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-6"
        >
          {/* KPI CARDS */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <motion.div variants={itemVariants} className="group relative overflow-hidden rounded-2xl bg-white p-6 text-slate-900 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Total Revenue</span>
                <span className="rounded-full bg-blue-50 p-2 text-blue-600">
                  <Briefcase className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">
                ${(revValue / 1000000).toFixed(2)}M
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-emerald-500">
                  <ArrowUpRight className="h-4 w-4" /> 12.5%
                </span>
                <span className="text-slate-400">vs last quarter</span>
              </div>
              {/* Highlight bar on hover */}
              <div className="absolute bottom-0 left-0 h-1 w-full scale-x-0 bg-blue-500 transition-transform duration-300 origin-left group-hover:scale-x-100" />
            </motion.div>

            <motion.div variants={itemVariants} className="group relative overflow-hidden rounded-2xl bg-white p-6 text-slate-900 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Net Profit</span>
                <span className="rounded-full bg-amber-50 p-2 text-amber-500">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">
                ${(profitValue / 1000000).toFixed(2)}M
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-emerald-500">
                  <ArrowUpRight className="h-4 w-4" /> 8.2%
                </span>
                <span className="text-slate-400">vs last quarter</span>
              </div>
              <div className="absolute bottom-0 left-0 h-1 w-full scale-x-0 bg-amber-400 transition-transform duration-300 origin-left group-hover:scale-x-100" />
            </motion.div>

            <motion.div variants={itemVariants} className="group relative overflow-hidden rounded-2xl bg-slate-100 p-6 text-slate-900 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Active Customers</span>
                <span className="rounded-full bg-slate-200 p-2 text-slate-600">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">
                {Math.floor(customerValue).toLocaleString()}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-emerald-500">
                  <ArrowUpRight className="h-4 w-4" /> 4.1%
                </span>
                <span className="text-slate-400">vs last quarter</span>
              </div>
              <div className="absolute bottom-0 left-0 h-1 w-full scale-x-0 bg-slate-800 transition-transform duration-300 origin-left group-hover:scale-x-100" />
            </motion.div>

            <motion.div variants={itemVariants} className="group relative overflow-hidden rounded-2xl bg-slate-100 p-6 text-slate-900 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Churn Rate</span>
                <span className="rounded-full bg-red-50 p-2 text-red-500">
                  <Activity className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">
                1.2%
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-red-500">
                  <ArrowDownRight className="h-4 w-4" /> 0.3%
                </span>
                <span className="text-slate-400">vs last quarter</span>
              </div>
              <div className="absolute bottom-0 left-0 h-1 w-full scale-x-0 bg-slate-800 transition-transform duration-300 origin-left group-hover:scale-x-100" />
            </motion.div>
          </div>

          {/* MAIN CHARTS SECTION */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Revenue Trend Area Chart */}
            <motion.div variants={itemVariants} className="lg:col-span-2 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Revenue & Profit Trend</h3>
                  <p className="text-sm text-slate-500">Monthly performance tracking (YTD)</p>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height={300} minWidth={0}>
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(val) => `$${val/1000}k`} />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", backgroundColor: "#0f172a", color: "#f8fafc" }}
                      itemStyle={{ color: "#f8fafc", fontSize: "14px" }}
                      formatter={formatChartCurrency}
                      labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
                    />
                    <Area type="monotone" dataKey="actual" name="Revenue" stroke="#3b82f6" strokeWidth={3} fill="url(#colorActual)" animationDuration={1500} />
                    <Area type="monotone" dataKey="profit" name="Profit" stroke="#fbbf24" strokeWidth={3} fill="url(#colorProfit)" animationDuration={1500} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Target vs Actual Bar Chart */}
            <motion.div variants={itemVariants} className="overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-slate-900">Target vs Actual</h3>
                <p className="text-sm text-slate-500">Performance against budget</p>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height={300} minWidth={0}>
                  <BarChart data={revenueData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(val) => `${val/1000}k`} />
                    <Tooltip
                      cursor={{ fill: "#f1f5f9" }}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", backgroundColor: "#ffffff" }}
                      formatter={formatChartCurrency}
                    />
                    <Bar dataKey="target" name="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} animationDuration={1500} />
                    <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* BOTTOM SECTION */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Top Performers */}
            <motion.div variants={itemVariants} className="overflow-hidden rounded-2xl bg-slate-800 p-6 shadow-xl">
              <div className="mb-6 flex items-center gap-2">
                <Target className="h-5 w-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-white">Top Divisions</h3>
              </div>
              <div className="space-y-5">
                {topPerformers.map((item, i) => (
                  <div key={item.id}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-200">{item.name}</span>
                      <span className="font-semibold text-white">{item.value}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 1.5, delay: i * 0.2, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Strategic Insights */}
            <motion.div variants={itemVariants} className="overflow-hidden rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
              <div className="mb-6 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-semibold text-slate-900">Strategic Insights</h3>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:bg-slate-100">
                  <h4 className="font-semibold text-slate-800">Q3 Expansion Target on Track</h4>
                  <p className="mt-1 text-sm text-slate-500">Current trajectory indicates we will hit the 15% YoY growth target by end of August.</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:bg-slate-100">
                  <h4 className="font-semibold text-slate-800">Customer Acquisition Cost (CAC)</h4>
                  <p className="mt-1 text-sm text-slate-500">CAC has decreased by 8% due to organic pipeline improvements.</p>
                </div>
              </div>
            </motion.div>

            {/* Action Items */}
            <motion.div variants={itemVariants} className="overflow-hidden rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
              <div className="mb-6 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-slate-900" />
                <h3 className="text-lg font-semibold text-slate-900">Executive Action Items</h3>
              </div>
              <div className="space-y-3">
                {actionItems.map((item) => (
                  <div key={item.id} className="group flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 transition-all hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-2 w-2 rounded-full ${
                          item.priority === "High"
                            ? "bg-red-500"
                            : item.priority === "Medium"
                            ? "bg-amber-400"
                            : "bg-slate-300"
                        }`}
                      />
                      <span className="text-sm font-medium text-slate-700 group-hover:text-blue-900">{item.text}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
