"use client";

import {
FileText
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle,
} from "@/components/ui/card";
import type {
GarageMe
} from "@/lib/garage-api-types";


export function CompanyControlBridge({ me }: { me: GarageMe }) {
  if (me.role !== "Owner") {
    return (
      <section className="space-y-4">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <Badge className="border-[#d11a2a]/40 bg-[#d11a2a]/12 text-[#ffe1e5]">
              Restricted
            </Badge>
            <CardTitle className="mt-4 text-2xl">CEO Control Only</CardTitle>
            <CardDescription>
              Pusat kontrol perusahaan hanya tersedia untuk akun Owner.
              Silakan kembali ke modul kerja role Anda.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="garage-panel garage-animate-in overflow-hidden">
        <CardHeader className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="border-[#f5a742]/40 bg-[#f5a742]/12 text-[#f5a742]">
                Internal Company Control
              </Badge>
              <CardTitle className="mt-4 text-3xl">
                CEO Control Dashboard
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Pusat arsip dokumen perusahaan, SOP, training, struktur direksi,
                playbook manajemen, approval, audit, dan full control GARAGE.
              </CardDescription>
            </div>
            <Button asChild className="garage-press">
              <Link href="/control">
                <FileText className="mr-2 size-4" />
                Buka Control Center
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            ["Role aktif", me.role],
            ["Dokumen", "Private vault"],
            ["Control", "CEO only"],
            ["Audit", "Upload & approval"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#34343c] bg-white/[0.04] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </div>
              <div className="mt-2 text-sm font-semibold text-white">{value}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
