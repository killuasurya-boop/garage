// Fullscreen API dengan prefiks lama (Safari iPad: webkit*). iPhone Safari tidak punya API ini
// untuk elemen halaman → pemanggil memakai fallback tata letak imersif (tinggi viewport dinamis).
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: (options?: unknown) => Promise<void> | void };

export function fullscreenSupported(doc: Document = document) {
  const d = doc as FsDocument;
  const el = doc.documentElement as FsElement;
  return Boolean((d.fullscreenEnabled ?? d.webkitFullscreenEnabled) && (el.requestFullscreen || el.webkitRequestFullscreen));
}

export function isFullscreen(doc: Document = document) {
  const d = doc as FsDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** true = berhasil masuk fullscreen. Harus dipanggil dari gesture pengguna. */
export async function enterFullscreen(doc: Document = document): Promise<boolean> {
  const el = doc.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return isFullscreen(doc);
  } catch {
    return false;
  }
}

export async function exitFullscreen(doc: Document = document) {
  const d = doc as FsDocument;
  try {
    if (doc.exitFullscreen && doc.fullscreenElement) await doc.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch {
    /* sudah keluar */
  }
}

export function onFullscreenChange(fn: () => void, doc: Document = document) {
  doc.addEventListener("fullscreenchange", fn);
  doc.addEventListener("webkitfullscreenchange", fn);
  return () => {
    doc.removeEventListener("fullscreenchange", fn);
    doc.removeEventListener("webkitfullscreenchange", fn);
  };
}
