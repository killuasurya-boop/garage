"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";

import { WMS_CHECKLIST_TEMPLATES } from "@/lib/wms-checklist-templates";

export function WmsReceivingChecklistDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tpl = WMS_CHECKLIST_TEMPLATES.receiving;
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (!open) return null;

  const allDone = tpl.items.every((_, i) => checked[i]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl border border-[#E8E8E8] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-2 text-[15px] font-bold text-[#111111]">
          <ClipboardCheck className="size-5 text-[#C8102E]" /> {tpl.title}
        </p>
        <p className="mt-1 text-[12.5px] text-[#6B7280]">Centang semua sebelum menyelesaikan penerimaan.</p>
        <ul className="mt-3 space-y-2">
          {tpl.items.map((label, i) => (
            <li key={label}>
              <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#111111]">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                  className="mt-0.5 size-4 accent-[#C8102E]"
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280]">
            Batal
          </button>
          <button
            type="button"
            disabled={!allDone}
            onClick={onConfirm}
            className="rounded-md bg-[#16A34A] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Lanjut Selesaikan
          </button>
        </div>
      </div>
    </div>
  );
}
