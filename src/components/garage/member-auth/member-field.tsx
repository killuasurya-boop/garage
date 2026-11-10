import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

/** Field member: label + ikon + input + bantuan/error. */
export function MemberField({
  label,
  icon,
  hint,
  error,
  className,
  trailing,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  /** Kontrol di kanan input (mis. tombol tampilkan/sembunyikan PIN). */
  trailing?: ReactNode;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <label htmlFor={id} className="gm-label">
        {label}
      </label>
      <div className="gm-control" data-invalid={error ? "true" : undefined}>
        {icon ? <span className="shrink-0 text-[var(--gm-metal)]" aria-hidden="true">{icon}</span> : null}
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-[#ffb3b5]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-[var(--gm-text-2)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
