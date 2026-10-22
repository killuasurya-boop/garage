/* eslint-disable react-hooks/set-state-in-effect -- Hydrate editable forms from server data and browser query state once, preserving subsequent edits. */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, ClipboardCheck, RefreshCw, Send, Truck } from "lucide-react";
import { garageApi } from "@/lib/api-client";
import type { ClosingTransitionInput } from "@/lib/wms-replenishment-types";
import { apiRoot, Badge, dateTime, Exports, Frame, Header, key, knownRejection, Loading, message, Nav, Notice, qty, Refresh, stateLabel, styles, useFeed } from "./replenishment-shared";
import type { AccessInfo, ClosingSettings, Preparation, RequestDetail } from "./replenishment-model";
import { management } from "./replenishment-model";

export function RequestCards({ requests, onSelect }: { requests: RequestDetail[]; onSelect?: (id: string) => void }) {
  if (!requests.length) return <div className={styles.empty}><ClipboardCheck size={28} /><strong>Belum ada permintaan</strong><p>Permintaan yang dikirim divisi akan tampil di sini.</p><Link className={styles.secondary} href="/warehouse/closing">Buka Closing Stock</Link></div>;
  return <div className={styles.list}>{requests.map(r => <article className={styles.request} key={r.id}><div className={styles.requestTitle}><div>{onSelect ? <button type="button" className={styles.secondary} onClick={() => onSelect(r.id)}>{r.doc}<ChevronRight size={16} /></button> : <Link href={`/warehouse/requests?id=${r.id}`}>{r.doc}</Link>}<p className={styles.muted}>{r.division === "bar" ? "Bar" : "Kitchen / Dapur"} · {r.warehouseName}</p></div><div className={styles.actions}><Badge value={r.noRequest ? "no_request" : r.status} />{r.late && <Badge value="Late Request" />}{r.priority === "urgent" && <Badge value="urgent" />}</div></div><div className={styles.lineInfo}><span>Operasional <strong>{r.businessDate}</strong></span><span>Dibutuhkan <strong>{r.neededDate}</strong></span><span><strong>{r.items.filter(i => i.requestedQty > 0).length}</strong> bahan diminta</span></div>{r.note && <p>{r.note}</p>}</article>)}</div>;
}

export function RequestDetailView({ id, access, onBack, sourceLocations = [] }: { id: string; access: AccessInfo; onBack?: () => void; sourceLocations?: { id: string; name: string }[] }) {
  const feed = useFeed<RequestDetail>(`${apiRoot}/requests/${id}`);
  const [action, setAction] = useState<ClosingTransitionInput["action"] | "">(""), [reason, setReason] = useState(""), [sourceId, setSourceId] = useState(""), [shipmentId, setShipmentId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({}), [damages, setDamages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<ClosingTransitionInput | null>(null);
  const settings = useFeed<ClosingSettings>(management(access) ? `${apiRoot}/settings` : null, 60000);
  const operations = useFeed<Preparation>(`${apiRoot}/preparation`, 30000);
  const doc = feed.data;
  const sources = sourceLocations.length ? sourceLocations : doc?.sourceLocations?.length ? doc.sourceLocations : operations.data?.sourceLocations?.length ? operations.data.sourceLocations : settings.data?.locations.filter(l => l.kind === "main").map(l => ({ id: l.warehouseId, name: settings.data!.warehouses.find(w => w.id === l.warehouseId)?.name ?? l.warehouseId })) ?? [];
  const outstandingShipments = doc?.shipments.filter(s => s.allocations.some(a => a.qty > a.receivedQty + a.damagedQty)) ?? [];
  useEffect(() => { setAction(""); setError(null); setSuccess(null); setPending(null); }, [id]);
  function choose(next: ClosingTransitionInput["action"]) {
    if (!doc) return;
    setAction(next); setError(null); setSuccess(null); setReason(""); setPending(null);
    const shipment = outstandingShipments[0]; setShipmentId(shipment?.id ?? "");
    const values: Record<string, string> = {};
    if (next === "receive") for (const a of shipment?.allocations ?? []) values[a.id] = String(Math.max(0, a.qty - a.receivedQty - a.damagedQty));
    else for (const item of doc.items) values[item.id] = String(next === "approve" ? Math.max(0, item.requestedQty - item.approvedQty) : next === "prepare" ? Math.max(0, item.approvedQty - item.dispatchedQty) : Math.max(0, item.preparedQty - item.dispatchedQty));
    setAmounts(values); setDamages({});
  }
  async function perform() {
    if (!doc || !action || busy) return;
    if (["reject", "cancel"].includes(action) && reason.trim().length < 3) { setError("Tulis alasan minimal 3 karakter."); return; }
    if (Object.values(amounts).some(v => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0) || Object.values(damages).some(v => v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0))) { setError("Jumlah harus berupa angka 0 atau lebih."); return; }
    const items = action === "receive" ? (outstandingShipments.find(s => s.id === shipmentId)?.allocations ?? []).map(a => ({ allocationId: a.id, qty: Number(amounts[a.id] ?? 0), damagedQty: Number(damages[a.id] ?? 0) })).filter(a => a.qty > 0 || a.damagedQty > 0) : ["approve", "prepare", "dispatch"].includes(action) ? doc.items.map(i => ({ itemId: i.id, qty: Number(amounts[i.id] ?? 0) })).filter(i => action === "prepare" || i.qty > 0) : undefined;
    if (items?.some(i => !Number.isFinite(i.qty) || i.qty < 0 || ("damagedQty" in i && (!Number.isFinite(i.damagedQty) || Number(i.damagedQty) < 0)))) { setError("Jumlah harus berupa angka 0 atau lebih."); return; }
    if (["approve", "prepare", "dispatch", "receive"].includes(action) && !items?.length) { setError("Isi jumlah pada setidaknya satu bahan."); return; }
    const payload: ClosingTransitionInput = pending ?? { action, idempotencyKey: key(), version: doc.version, ...(["approve", "dispatch"].includes(action) && sourceId ? { sourceWarehouseId: sourceId } : {}), ...(action === "receive" ? { shipmentId } : {}), ...(items ? { items } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) };
    setPending(payload); setBusy(true); setError(null);
    try { await garageApi.post(`${apiRoot}/requests/${id}/actions`, payload); setPending(null); setAction(""); setSuccess("Perubahan sudah dicatat oleh server."); await feed.reload(); }
    catch (e) { if (knownRejection(e)) setPending(null); setError(message(e)); }
    finally { setBusy(false); }
  }
  function setShipment(value: string) { setShipmentId(value); const shipment = outstandingShipments.find(s => s.id === value); setAmounts(Object.fromEntries((shipment?.allocations ?? []).map(a => [a.id, String(Math.max(0, a.qty - a.receivedQty - a.damagedQty))]))); setDamages({}); }
  if (feed.loading) return <Loading />;
  if (!doc) return <Notice error>{feed.error ?? "Permintaan tidak ditemukan."}<button className={styles.secondary} onClick={() => void feed.reload()}>Coba lagi</button></Notice>;
  const terminal = ["completed", "cancelled", "rejected"].includes(doc.status), manager = management(access), warehouse = doc.capabilities?.warehouse ?? operations.data?.capabilities.warehouse ?? false;
  const receiveAllowed = doc.capabilities?.receive ?? manager;
  return <div className={styles.list} data-testid="request-detail">
    <div className={styles.actions}>{onBack ? <button className={styles.secondary} type="button" onClick={onBack}><ArrowLeft size={18} />Daftar permintaan</button> : <Link className={styles.secondary} href="/warehouse/requests"><ArrowLeft size={18} />Daftar permintaan</Link>}<Refresh updated={feed.updated} reload={feed.reload} /></div>
    {feed.error && <Notice error>{feed.error} Data terakhir tetap ditampilkan.</Notice>}{success && <Notice>{success}</Notice>}
    <section className={styles.section}><div className={styles.sectionHeader}><div><h2>{doc.doc}</h2><p className={styles.muted}>{doc.division === "bar" ? "Bar" : "Kitchen / Dapur"} · {doc.warehouseName}</p></div><div className={styles.actions}><Badge value={doc.noRequest ? "no_request" : doc.status} />{doc.late && <Badge value="Late Request" />}</div></div><div className={styles.sectionBody}><div className={styles.lineInfo}><span>Operasional <strong>{doc.businessDate}</strong></span><span>Dibutuhkan <strong>{doc.neededDate}</strong></span><span>Prioritas <strong>{stateLabel(doc.priority)}</strong></span><span>Versi <strong>{doc.version}</strong></span></div>{doc.note && <p>{doc.note}</p>}
      {doc.status === "draft" && <Link className={styles.primary} href={`/warehouse/closing?id=${doc.id}`}>Lanjutkan draft closing</Link>}
      {!terminal && doc.status !== "draft" && !action && <div className={styles.actions}>
        {warehouse && doc.status === "submitted" && <button type="button" className={styles.primary} onClick={() => choose("review")}>Mulai tinjau</button>}
        {warehouse && ["submitted", "under_review", "partially_available", "partially_received"].includes(doc.status) && <button type="button" className={styles.primary} onClick={() => choose("approve")}>Setujui & reservasi</button>}
        {warehouse && ["approved", "partially_available", "preparing", "partially_received"].includes(doc.status) && <button type="button" className={styles.primary} onClick={() => choose("prepare")}>Mulai siapkan</button>}
        {warehouse && doc.status === "preparing" && <button type="button" className={styles.primary} onClick={() => choose("ready")}>Tandai siap diserahkan</button>}
        {warehouse && ["ready", "partially_received", "dispatched"].includes(doc.status) && doc.items.some(i => i.reservedQty > 0) && <button type="button" className={styles.primary} onClick={() => choose("dispatch")}><Truck size={18} />Kirim bahan</button>}
        {receiveAllowed && outstandingShipments.length > 0 && <button type="button" className={styles.primary} onClick={() => choose("receive")}>Konfirmasi penerimaan</button>}
        {manager && ["submitted", "under_review"].includes(doc.status) && <button type="button" className={styles.danger} onClick={() => choose("reject")}>Tolak permintaan</button>}
        {manager && !doc.items.some(i => i.dispatchedQty > 0) && <button type="button" className={styles.secondary} onClick={() => choose("cancel")}>Batalkan</button>}
      </div>}
    </div></section>
    {action && <section className={styles.section}><div className={styles.sectionHeader}><h2>{({ review: "Tinjau permintaan", approve: "Setujui jumlah pemenuhan", prepare: "Mulai persiapan", ready: "Konfirmasi bahan siap", dispatch: "Kirim bahan ke divisi", receive: "Konfirmasi jumlah yang diterima", reject: "Tolak permintaan", cancel: "Batalkan permintaan" })[action]}</h2><button className={styles.secondary} type="button" disabled={busy || !!pending} onClick={() => setAction("")}>Tutup</button></div><div className={styles.sectionBody}>
      <Notice>{action === "approve" ? "Persetujuan membuat reservasi. Stok fisik belum berpindah." : action === "dispatch" ? "Pengiriman memindahkan stok ke lokasi transit. Stok divisi bertambah setelah penerimaan dikonfirmasi." : action === "receive" ? "Isi hanya jumlah tambahan yang diterima pada pemeriksaan ini. Pisahkan barang baik dan rusak; sisa tetap dalam perjalanan." : "Status dan pelaksana tindakan akan tersimpan di histori."}</Notice>
      {["approve", "dispatch"].includes(action) && <label>Gudang sumber<select aria-label="Gudang sumber pemenuhan" disabled={busy || !!pending} value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">Pilih gudang sumber</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {action === "receive" && <label>Dokumen pengiriman<select disabled={busy || !!pending} value={shipmentId} onChange={e => setShipment(e.target.value)}>{outstandingShipments.map(s => <option value={s.id} key={s.id}>{s.doc}</option>)}</select></label>}
      {["approve", "prepare", "dispatch"].includes(action) && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Bahan</th><th>Diminta</th><th>Tersisa direservasi</th><th>{action === "approve" ? "Setujui sekarang" : action === "prepare" ? "Jumlah disiapkan" : "Kirim sekarang"}</th></tr></thead><tbody>{doc.items.filter(i => i.requestedQty > 0).map(i => <tr key={i.id}><td>{i.name}<p className={styles.muted}>{i.unit}</p></td><td>{qty(i.requestedQty)}</td><td>{qty(i.reservedQty)}</td><td><input aria-label={`${action === "approve" ? "Setujui" : action === "prepare" ? "Siapkan" : "Kirim"} ${i.name}`} disabled={busy || !!pending} type="number" min="0" step="0.0001" value={amounts[i.id] ?? "0"} onChange={e => setAmounts(v => ({ ...v, [i.id]: e.target.value }))} /></td></tr>)}</tbody></table></div>}
      {action === "receive" && <div className={styles.list}>{outstandingShipments.find(s => s.id === shipmentId)?.allocations.map(a => { const item = doc.items.find(i => i.id === a.itemId); const remaining = a.qty - a.receivedQty - a.damagedQty; return remaining > 0 && <div className={styles.request} key={a.id}><h3>{item?.name ?? "Bahan"}</h3><p className={styles.muted}>Batch {a.batchNo} · kedaluwarsa {a.expiredAt ? dateTime(a.expiredAt) : "Tidak tercatat"} · tersisa {qty(remaining)} {item?.unit}</p><div className={styles.grid2}><label>Diterima baik ({item?.unit})<input aria-label={`Diterima baik ${item?.name} ${a.batchNo}`} type="number" min="0" step="0.0001" disabled={busy || !!pending} value={amounts[a.id] ?? "0"} onChange={e => setAmounts(v => ({ ...v, [a.id]: e.target.value }))} /></label><label>Diterima rusak ({item?.unit})<input aria-label={`Diterima rusak ${item?.name} ${a.batchNo}`} type="number" min="0" step="0.0001" disabled={busy || !!pending} value={damages[a.id] ?? "0"} onChange={e => setDamages(v => ({ ...v, [a.id]: e.target.value }))} /></label></div></div>; })}</div>}
      <label>{["reject", "cancel"].includes(action) ? "Alasan (wajib)" : "Catatan tindakan / selisih"}<textarea disabled={busy || !!pending} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} placeholder="Jelaskan catatan, pengecualian, atau selisih penerimaan" /></label>
      {error && <Notice error>{error}<p>Gunakan Coba lagi untuk mengulang tindakan yang sama. Bila terjadi konflik versi, muat ulang dokumen sebelum memulai tindakan baru.</p></Notice>}
      <div className={styles.actions}><button type="button" data-testid={`request-${action}`} className={styles.primary} disabled={busy || ["approve", "dispatch"].includes(action) && !sourceId && !pending} onClick={() => void perform()}><Send size={18} />{busy ? "Memproses…" : pending ? "Coba lagi tindakan yang sama" : "Konfirmasi tindakan"}</button>{error && <button className={styles.secondary} type="button" disabled={busy} onClick={() => { setPending(null); setAction(""); void feed.reload(); }}><RefreshCw size={18} />Muat ulang dokumen</button>}</div>
    </div></section>}
    <section className={styles.section}><div className={styles.sectionHeader}><h2>Bahan & pemenuhan</h2></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Bahan</th><th>Fisik / sistem</th><th>Diminta</th><th>Reservasi</th><th>Dikirim</th><th>Diterima baik</th><th>Rusak / kurang</th></tr></thead><tbody>{doc.items.map(i => <tr key={i.id}><td><strong>{i.name}</strong><p className={styles.muted}>{i.sku} · {i.unit}</p></td><td>{i.physicalQty === null ? "Belum dihitung" : qty(i.physicalQty)} / {qty(i.systemQty)}</td><td>{qty(i.requestedQty)}</td><td>{qty(i.reservedQty)}</td><td>{qty(i.dispatchedQty)}</td><td>{qty(i.receivedQty)}</td><td>{qty(i.damagedQty)} / {qty(i.shortageQty)}</td></tr>)}</tbody></table></div></section>
    {doc.shipments.length > 0 && <section className={styles.section}><div className={styles.sectionHeader}><h2>Pengiriman</h2></div><div className={styles.sectionBody}>{doc.shipments.map(s => <div key={s.id} className={styles.lineInfo}><strong>{s.doc}</strong><Badge value={s.status} /><span>{dateTime(s.createdAt)}</span><span>{s.allocations.length} alokasi batch</span></div>)}</div></section>}
    <section className={styles.section}><div className={styles.sectionHeader}><h2>Riwayat tindakan</h2></div><div className={styles.sectionBody}><ol className={styles.timeline}>{doc.history.map((h, i) => <li key={`${h.createdAt}-${i}`}><strong>{h.action}</strong><p>{h.actorName}</p><time dateTime={h.createdAt}>{dateTime(h.createdAt)}</time></li>)}</ol></div></section>
  </div>;
}

export function RequestsPage({ access }: { access: AccessInfo }) {
  const [neededDate, setNeededDate] = useState(""), [division, setDivision] = useState(""), [status, setStatus] = useState(""), [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { setSelected(new URLSearchParams(window.location.search).get("id")); }, []);
  const query = new URLSearchParams({ ...(neededDate ? { neededDate } : {}), ...(division ? { division } : {}), ...(status ? { status } : {}) }).toString();
  const feed = useFeed<RequestDetail[]>(`${apiRoot}/requests?${query}`);
  const notifications = useFeed<{id:string;title:string;text:string;href:string;updatedAt:string}[]>(`${apiRoot}/notifications`);
  return <Frame><Header title="Permintaan Bahan" detail="Ikuti kebutuhan Bar dan Dapur dari pengajuan hingga penerimaan."><Link className={styles.primary} href="/warehouse/closing">Buat closing / permintaan</Link></Header><Nav />
    {notifications.data && notifications.data.length > 0 && <section className={styles.section}><div className={styles.sectionHeader}><h2>Perlu ditindaklanjuti</h2></div><div className={styles.sectionBody}>{notifications.data.map(n=><div key={n.id} className={styles.requestTitle}><div><strong>{n.title}</strong><p className={styles.muted}>{n.text}</p><small>{dateTime(n.updatedAt)}</small></div><Link className={styles.secondary} href={n.href}>Buka dokumen</Link></div>)}</div></section>}
    {selected ? <RequestDetailView id={selected} access={access} onBack={() => setSelected(null)} /> : <><section className={styles.section}><div className={styles.sectionBody}><div className={styles.toolbar}><label>Tanggal kebutuhan<input type="date" value={neededDate} onChange={e => setNeededDate(e.target.value)} /></label><label>Divisi<select value={division} onChange={e => setDivision(e.target.value)}><option value="">Semua yang diizinkan</option><option value="bar">Bar</option><option value="dapur">Kitchen / Dapur</option></select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua status</option>{["draft", "submitted", "under_review", "approved", "partially_available", "preparing", "ready", "dispatched", "partially_received", "completed", "rejected", "cancelled"].map(s => <option value={s} key={s}>{stateLabel(s)}</option>)}</select></label></div></div></section>
      <Refresh updated={feed.updated} reload={feed.reload} />{feed.error && <Notice error>{feed.error}</Notice>}{feed.loading ? <Loading /> : <RequestCards requests={feed.data ?? []} onSelect={setSelected} />}<Exports query={query} /></>}
  </Frame>;
}
