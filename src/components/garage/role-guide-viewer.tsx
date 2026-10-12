"use client";

import { AlertTriangle, CheckCircle2, Circle, Lightbulb, Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { guidesForRole, type RoleGuide } from "@/lib/role-guides";

const READ_KEY = "garage:guide-read";

function loadRead(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(READ_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function printGuide(guide: RoleGuide) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return;
  const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = guide.sections
    .map(
      (section) => `<h2>${esc(section.title)}</h2>${section.intro ? `<p>${esc(section.intro)}</p>` : ""}<ol>${section.steps
        .map(
          (step) =>
            `<li>${esc(step.text)}${step.tip ? `<div class="tip">Tips: ${esc(step.tip)}</div>` : ""}${
              step.warn ? `<div class="warn">Penting: ${esc(step.warn)}</div>` : ""
            }</li>`,
        )
        .join("")}</ol>${
        section.faq?.length
          ? `<ul class="faq">${section.faq.map((f) => `<li><b>${esc(f.q)}</b> ${esc(f.a)}</li>`).join("")}</ul>`
          : ""
      }`,
    )
    .join("");
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(guide.title)}</title><style>
    body{font:14px/1.55 Arial,sans-serif;color:#111;margin:28px;max-width:760px}
    h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
    .tip{background:#fff6e0;padding:3px 6px;margin:3px 0;border-left:3px solid #f5a742}
    .warn{background:#ffe9ea;padding:3px 6px;margin:3px 0;border-left:3px solid #d11a2a}
    li{margin:4px 0} .meta{color:#555}
  </style></head><body><h1>${esc(guide.title)}</h1><p class="meta">${esc(guide.summary)} · Diperbarui ${esc(guide.updatedAt)}</p>${body}</body></html>`);
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 200);
}

/** Tab "Panduan" di modul Training: panduan kerja sesuai role akun. */
export function RoleGuideViewer({ role, workstation = null }: { role: string; workstation?: string | null }) {
  const guides = useMemo(() => guidesForRole(role, workstation), [role, workstation]);
  const [guideId, setGuideId] = useState(guides[0]?.id ?? "");
  const guide = guides.find((item) => item.id === guideId) ?? guides[0];
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [read, setRead] = useState<Record<string, boolean>>(() => (typeof window === "undefined" ? {} : loadRead()));

  if (!guide) {
    return (
      <div className="rounded-lg border border-dashed border-[#34343c] bg-[#181820] p-8 text-center text-sm text-zinc-400">
        Panduan untuk peran Anda sedang disiapkan.
      </div>
    );
  }

  const section = guide.sections.find((item) => item.id === sectionId) ?? guide.sections[0];
  const readCount = guide.sections.filter((item) => read[`${guide.id}:${item.id}`]).length;

  function toggleRead(id: string) {
    setRead((current) => {
      const next = { ...current, [`${guide.id}:${id}`]: !current[`${guide.id}:${id}`] };
      try {
        window.localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        // storage diblokir: tanda baca hanya untuk tab ini
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#34343c] bg-[#181820] p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">{guide.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#c4c4cc]">{guide.summary}</p>
          <p className="mt-1 text-xs text-[#a1a1aa]">
            Sudah dibaca {readCount}/{guide.sections.length} bab · diperbarui {guide.updatedAt}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {guides.length > 1 ? (
            <select
              aria-label="Pilih panduan"
              value={guide.id}
              onChange={(event) => {
                setGuideId(event.target.value);
                setSectionId(null);
              }}
              className="h-10 rounded-md border border-[#4a4a54] bg-[#1b1b20] px-2 text-sm text-white"
            >
              {guides.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          ) : null}
          <Button type="button" variant="outline" className="h-10" onClick={() => printGuide(guide)}>
            <Printer className="mr-2 size-4" />
            Cetak / PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Daftar bab" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {guide.sections.map((item) => {
            const active = item.id === section.id;
            const done = read[`${guide.id}:${item.id}`];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSectionId(item.id)}
                aria-current={active ? "true" : undefined}
                className={`garage-press flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                  active
                    ? "border-[#d11a2a] bg-[#d11a2a]/15 text-white"
                    : "border-[#34343c] bg-[#181820] text-[#d8d8de] hover:bg-white/[0.06]"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-[#f5a742]" />
                ) : (
                  <Circle className="size-4 shrink-0 text-[#71717a]" />
                )}
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>

        <article className="rounded-lg border border-[#34343c] bg-[#181820] p-4">
          <h3 className="text-base font-bold text-white">{section.title}</h3>
          {section.intro ? <p className="mt-1 text-sm leading-6 text-[#c4c4cc]">{section.intro}</p> : null}
          <ol className="mt-3 space-y-3">
            {section.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#4a4a54] bg-white/[0.06] text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm leading-6 text-[#ececf1]">{step.text}</p>
                  {step.tip ? (
                    <p className="flex gap-2 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-2.5 py-1.5 text-xs leading-5 text-[#ffe2b0]">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                      {step.tip}
                    </p>
                  ) : null}
                  {step.warn ? (
                    <p className="flex gap-2 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2.5 py-1.5 text-xs leading-5 text-[#ffc9cb]">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {step.warn}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {section.faq?.length ? (
            <div className="mt-4 space-y-2 border-t border-[#34343c] pt-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#a1a1aa]">Tanya jawab</p>
              {section.faq.map((item) => (
                <div key={item.q}>
                  <p className="text-sm font-semibold text-white">{item.q}</p>
                  <p className="text-sm leading-6 text-[#c4c4cc]">{item.a}</p>
                </div>
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="mt-4 h-10"
            onClick={() => toggleRead(section.id)}
          >
            <CheckCircle2 className="mr-2 size-4" />
            {read[`${guide.id}:${section.id}`] ? "Tandai belum dibaca" : "Tandai sudah dibaca"}
          </Button>
        </article>
      </div>
    </div>
  );
}
