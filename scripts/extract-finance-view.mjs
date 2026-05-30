import fs from "fs";

const lines = fs.readFileSync("src/components/garage/garage-app.tsx", "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith("type FinanceTab"));
const end = lines.findIndex((l) => l.startsWith("type CrmTab"));
const header = `"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Coffee,
  CreditCard,
  FileText,
  Landmark,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Square,
  Wallet,
} from "lucide-react";
import { currency } from "@/lib/garage-data";
import type { CashSession, ClosingChecklistItem, PaymentBreakdown } from "@/lib/garage-api-types";
import type { FinanceOverview } from "@/lib/finance-types";
import { garageApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceInvoiceList } from "@/components/garage/finance-invoice-list";
import { FinanceAnomalyPanel } from "@/components/garage/finance-anomaly-panel";
import { FinanceCfoBrief } from "@/components/garage/finance/finance-cfo-brief";
import { FinanceClosingPanel } from "@/components/garage/finance/finance-closing-panel";
import { FinanceKpi, FinanceStat } from "@/components/garage/finance/finance-kpi";

const statusClass: Record<string, string> = {
  good: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]",
  warning: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]",
  critical: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
  healthy: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  info: "border-[#3b82f6]/45 bg-[#3b82f6]/12 text-[#93c5fd]",
};

`;

const body = lines
  .slice(start, end)
  .join("\n")
  .replace("function FinanceView", "export function FinanceView")
  .replace("function FinalMvpUatPanel", "export function FinalMvpUatPanel");

fs.writeFileSync("src/components/garage/finance/finance-view.tsx", header + body);
console.log("Wrote finance-view.tsx", end - start, "lines");
