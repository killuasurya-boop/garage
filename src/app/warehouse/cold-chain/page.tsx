"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { AlertTriangle, Snowflake, ThermometerSnowflake } from "lucide-react";

import { garageApi } from "@/lib/api-client";

type Unit = { code: string; latest: number; safe: boolean; series: Array<{ t: string; temp: number }> };
type ColdChain = { units: Unit[]; alerts: Array<{ code: string; temp: number }> };

export default function WmsColdChainPage() {
  const [data, setData] = useState<ColdChain | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await garageApi.get<ColdChain>("/api/wms/cold-chain");
        if (alive) setData(d);
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-[#111111]">
          <ThermometerSnowflake className="size-6 text-[#2563EB]" /> Cold Chain Monitor
        </h1>
        <p className="text-[13px] text-[#6B7280]">Pantau suhu chiller & freezer (IoT). Zona aman chiller 0–8°C, freezer ≤ −12°C.</p>
      </div>

      {!data ? (
        <p className="text-[13px] text-[#6B7280]">Memuat…</p>
      ) : (
        <>
          {data.alerts.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-[#DC2626] bg-[#FEE2E2] px-3 py-2 text-[13px] font-semibold text-[#DC2626]">
              <AlertTriangle className="size-4" /> {data.alerts.length} unit di luar zona aman: {data.alerts.map((a) => `${a.code} (${a.temp}°C)`).join(", ")}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.units.map((u) => (
              <div key={u.code} className="rounded-xl border bg-white p-4" style={{ borderColor: u.safe ? "#E8E8E8" : "#FCA5A5" }}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#111111]">
                    <Snowflake className="size-4 text-[#2563EB]" /> {u.code}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: u.safe ? "#DCFCE7" : "#FEE2E2", color: u.safe ? "#16A34A" : "#DC2626" }}>
                    {u.safe ? "Aman" : "Alert"}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[30px] font-extrabold" style={{ color: u.safe ? "#111111" : "#DC2626" }}>
                  {u.latest}°C
                </p>
                <div className="mt-1 h-[56px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={u.series}>
                      <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E8E8E8", fontSize: 11 }} labelFormatter={() => "Suhu"} />
                      <Line type="monotone" dataKey="temp" name="°C" stroke={u.safe ? "#2563EB" : "#DC2626"} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-[10.5px] text-[#9CA3AF]">Tren 24 jam terakhir</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
