"use client";

// "Hari ini" versi tanggal operasional (B1b) untuk preset laporan di layar.
// Kebijakan dibaca sekali dari /api/settings (global) lalu di-cache per tab; sampai
// termuat / bila gagal → kalender WIB (sama seperti sebelum B1b).
import { useEffect, useState } from "react";

import { garageApi } from "@/lib/api-client";
import { businessDateKey, CALENDAR_POLICY, normalizeBusinessDayPolicy, type BusinessDayPolicy } from "@/lib/business-date";

let policyPromise: Promise<BusinessDayPolicy> | null = null;

function loadPolicy() {
  policyPromise ??= garageApi
    .get<{ settings: { businessDayCutoffHour?: unknown; businessDayEffectiveDate?: unknown } }>("/api/settings", {
      cache: "no-store",
    })
    .then(({ settings }) =>
      normalizeBusinessDayPolicy({
        cutoffHour: settings.businessDayCutoffHour,
        effectiveFrom: settings.businessDayEffectiveDate,
      }),
    )
    .catch(() => {
      policyPromise = null;
      return CALENDAR_POLICY;
    });
  return policyPromise;
}

export function useBusinessToday() {
  const [today, setToday] = useState(() => businessDateKey(new Date()));
  useEffect(() => {
    let cancelled = false;
    void loadPolicy().then((policy) => {
      if (!cancelled) setToday(businessDateKey(new Date(), policy));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return today;
}
