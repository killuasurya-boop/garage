"use client";

import { useEffect } from "react";
import { Download } from "lucide-react";

export function InvoicePrintButton() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("print") !== "1") {
      return;
    }

    const timeout = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <button
      type="button"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 px-4 text-sm font-bold text-[#ffe7b8]"
      onClick={() => window.print()}
    >
      <Download className="size-4" />
      Export PDF
    </button>
  );
}