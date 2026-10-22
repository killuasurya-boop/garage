/* eslint-disable react-hooks/set-state-in-effect -- Initialize fetch status when the requested server resource changes. */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { GarageApiError, garageApi } from "@/lib/api-client";
import styles from "./replenishment.module.css";

export { styles };
export const apiRoot = "/api/wms/replenishment";
export const labels: Record<string, string> = { draft: "Draft", submitted: "Dikirim", under_review: "Ditinjau", approved: "Disetujui", partially_available: "Tersedia sebagian", preparing: "Disiapkan", ready: "Siap diserahkan", dispatched: "Dalam perjalanan", partially_received: "Diterima sebagian", completed: "Selesai", rejected: "Ditolak", cancelled: "Dibatalkan", no_request: "Tidak ada kebutuhan", pending: "Menunggu persetujuan", normal: "Normal", urgent: "Mendesak" };
export function stateLabel(value: string) { return labels[value] ?? value.replaceAll("_", " "); }
export function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function nextDate(value = localDate()) { const d = new Date(`${value}T12:00:00+07:00`); d.setUTCDate(d.getUTCDate() + 1); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
export function qty(value: unknown) { return Number(value ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 4 }); }
export function dateTime(value: string | Date | null | undefined) { return value ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) + " WIB" : "—"; }
export function message(error: unknown) { return error instanceof Error ? error.message : "Data belum berhasil diproses. Coba lagi."; }
export function knownRejection(error: unknown) { return error instanceof GarageApiError && error.status >= 400 && error.status < 500; }
export function key() { return crypto.randomUUID(); }
export function Badge({ value }: { value: string }) { return <span className={`${styles.badge} ${["urgent", "rejected", "cancelled"].includes(value) ? styles.bad : ["completed", "approved", "ready", "no_request"].includes(value) ? styles.good : styles.warn}`}>{stateLabel(value)}</span>; }
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={`${styles.notice} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}>{error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<div>{children}</div></div>; }
export function Loading() { return <div className={styles.loading} role="status"><LoaderCircle className="animate-spin motion-reduce:animate-none" size={20} /> Memuat data gudang…</div>; }
export function Header({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) { return <header className={styles.pageHeader}><div><h1>{title}</h1><p>{detail}</p></div><div className={styles.actions}>{children}</div></header>; }
export function Frame({ children }: { children: ReactNode }) { return <div className={styles.root}>{children}</div>; }
export function Nav() { return <nav aria-label="Closing dan persiapan bahan" className={styles.tabs}><Link href="/warehouse/closing">Closing Stock</Link><Link href="/warehouse/requests">Permintaan Bahan</Link><Link href="/warehouse/preparation">Persiapan Besok</Link><Link href="/warehouse/purchasing">Kekurangan & Pembelian</Link></nav>; }
export function useFeed<T>(url: string | null, interval = 15000) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true), [updated, setUpdated] = useState<string | null>(null);
  const reload = useCallback(async () => { if (!url) { setLoading(false); return; } try { const result = await garageApi.get<T>(url); setData(result); setError(null); setUpdated(new Date().toISOString()); } catch (e) { setError(message(e)); } finally { setLoading(false); } }, [url]);
  useEffect(() => { let live = true; setLoading(true); if (!url) { setData(null); setLoading(false); return; } const read = async () => { try { const result = await garageApi.get<T>(url); if (live) { setData(result); setError(null); setUpdated(new Date().toISOString()); } } catch (e) { if (live) setError(message(e)); } finally { if (live) setLoading(false); } }; void read(); const timer = setInterval(() => { if (document.visibilityState === "visible") void read(); }, interval); return () => { live = false; clearInterval(timer); }; }, [url, interval]);
  return { data, setData, error, loading, updated, reload };
}
export function Refresh({ updated, reload }: { updated: string | null; reload: () => Promise<unknown> }) { return <div className={styles.refresh}><span>{updated ? `Diperbarui ${new Date(updated).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB · cek tiap 15 detik` : "Menunggu data server"}</span><button className={styles.iconButton} type="button" aria-label="Muat ulang data" onClick={() => void reload()}><RefreshCw size={18} /></button></div>; }
export function Exports({ query = "" }: { query?: string }) { return <div className={styles.actions} aria-label="Unduh laporan">{["pdf", "xlsx", "csv"].map(format => <a className={styles.secondary} key={format} href={`${apiRoot}/reports?format=${format}${query ? `&${query}` : ""}`}>Unduh {format.toUpperCase()}</a>)}</div>; }
