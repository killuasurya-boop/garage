"use client";

// Form otomatis dari JSON Schema tool (z.toJSONSchema). Hanya tipe yang dipakai katalog:
// string (enum → pilihan, tanggal), number/integer, boolean; object/array → JSON.
// Nilai kosong opsional tidak dikirim; validasi akhir tetap di server (Zod).
import { Input } from "@/components/ui/input";

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
};

type JsonSchemaProp = {
  type?: string | string[];
  enum?: unknown[];
  description?: string;
  format?: string;
  pattern?: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  anyOf?: JsonSchemaProp[];
};

export type FormValues = Record<string, string | boolean>;

function primaryType(prop: JsonSchemaProp): string {
  const raw = prop.type ?? prop.anyOf?.find((p) => p.type && p.type !== "null")?.type;
  const type = Array.isArray(raw) ? raw.find((t) => t !== "null") : raw;
  return type ?? "string";
}

function isDate(prop: JsonSchemaProp) {
  return prop.format === "date" || prop.pattern === "^\\d{4}-\\d{2}-\\d{2}$";
}

/**
 * Angka gaya Indonesia: "20.000" → 20000, "2,5" → 2.5, "2.5" → 2.5 (titik hanya dibuang bila polanya
 * benar-benar pemisah ribuan — "2.5" tidak boleh menjadi 25).
 */
export function parseIdNumber(raw: string) {
  const value = raw.trim().replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) return Number(value.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+(,\d+)?$/.test(value)) return Number(value.replace(",", "."));
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return Number.NaN;
}

/** Ubah nilai form → argumen tool. Melempar Error berbahasa Indonesia bila JSON/angka tidak valid. */
export function formToArgs(schema: JsonSchema, values: FormValues) {
  const args: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const value = values[key];
    const type = primaryType(prop);
    if (type === "boolean") {
      if (value === true || (schema.required ?? []).includes(key)) args[key] = value === true;
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") continue;
    if (type === "number" || type === "integer") {
      const n = parseIdNumber(value);
      if (!Number.isFinite(n)) throw new Error(`${key}: harus angka.`);
      args[key] = type === "integer" ? Math.round(n) : n;
    } else if (type === "object" || type === "array") {
      try {
        args[key] = JSON.parse(value);
      } catch {
        throw new Error(`${key}: format JSON tidak valid.`);
      }
    } else {
      args[key] = value.trim();
    }
  }
  return args;
}

export function SchemaForm({
  schema,
  values,
  onChange,
  disabled,
}: {
  schema: JsonSchema;
  values: FormValues;
  onChange: (next: FormValues) => void;
  disabled?: boolean;
}) {
  const entries = Object.entries(schema.properties ?? {});
  if (!entries.length) return <p className="text-xs text-zinc-400">Tool ini tidak butuh isian.</p>;
  const required = new Set(schema.required ?? []);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, prop]) => {
        const type = primaryType(prop);
        const id = `arg-${key}`;
        const label = (
          <span className="text-xs font-semibold text-zinc-200">
            {key}
            {required.has(key) ? <span className="text-[var(--garage-red-bright,#ff4d5e)]"> *</span> : <span className="text-zinc-500"> (opsional)</span>}
          </span>
        );
        const hint = prop.description ? <span className="text-[11px] leading-4 text-zinc-400">{prop.description}</span> : null;
        const wide = type === "object" || type === "array" || (prop.maxLength ?? 0) > 200;
        if (type === "boolean") {
          return (
            <label key={key} htmlFor={id} className="flex items-start gap-2 rounded-md border border-white/10 bg-black/20 p-2.5 sm:col-span-1">
              <input
                id={id}
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--garage-red,#d11a2a)]"
                checked={values[key] === true}
                disabled={disabled}
                onChange={(e) => onChange({ ...values, [key]: e.target.checked })}
              />
              <span className="flex flex-col gap-0.5">
                {label}
                {hint}
              </span>
            </label>
          );
        }
        const common = {
          id,
          disabled,
          value: typeof values[key] === "string" ? (values[key] as string) : "",
          onChange: (e: { target: { value: string } }) => onChange({ ...values, [key]: e.target.value }),
        };
        return (
          <label key={key} htmlFor={id} className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
            {label}
            {prop.enum ? (
              <select
                {...common}
                className="h-9 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-2 text-sm text-zinc-100"
              >
                <option value="">— pilih —</option>
                {prop.enum.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
            ) : wide ? (
              <textarea
                {...common}
                rows={type === "object" || type === "array" ? 4 : 3}
                placeholder={type === "object" ? "{ }" : type === "array" ? "[ ]" : ""}
                className="rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-2 py-1.5 font-mono text-xs text-zinc-100"
              />
            ) : (
              <Input
                {...common}
                type={isDate(prop) ? "date" : type === "number" || type === "integer" ? "text" : "text"}
                inputMode={type === "number" || type === "integer" ? "numeric" : undefined}
              />
            )}
            {hint}
          </label>
        );
      })}
    </div>
  );
}
