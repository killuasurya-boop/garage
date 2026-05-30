import type {
  AiOperationalAlert,
  AiStaffSupervisionKind,
} from "@/lib/garage-api-types";

export function supervisionKindMeta(kind: AiStaffSupervisionKind | null) {
  if (kind === "mistake") {
    return {
      label: "Kesalahan",
      className: "border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffc2c8]",
      icon: "!",
    };
  }

  if (kind === "correction") {
    return {
      label: "Perlu dibenahi",
      className: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffe7b8]",
      icon: "→",
    };
  }

  if (kind === "coaching") {
    return {
      label: "Pengingat",
      className: "border-[#4a4a54] bg-white/[0.08] text-[#e4e4e8]",
      icon: "i",
    };
  }

  return {
    label: "Info",
    className: "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]",
    icon: "•",
  };
}

export function alertShortTitle(alert: AiOperationalAlert) {
  return alert.title
    .replace(/^Kesalahan:\s*/i, "")
    .replace(/^Perlu dibenahi:\s*/i, "")
    .replace(/^Pengingat SOP:\s*/i, "")
    .replace(/^Pengingat:\s*/i, "");
}

export function alertInstruction(alert: AiOperationalAlert) {
  if (alert.fixAction) {
    return alert.fixAction;
  }

  const marker = "Yang harus dilakukan:";
  const index = alert.detail.indexOf(marker);
  if (index >= 0) {
    return alert.detail.slice(index + marker.length).trim();
  }

  return alert.detail;
}

export function alertContextLine(alert: AiOperationalAlert) {
  if (!alert.fixAction) {
    return null;
  }

  const marker = "Yang harus dilakukan:";
  const index = alert.detail.indexOf(marker);
  if (index <= 0) {
    return null;
  }

  const context = alert.detail.slice(0, index).trim();
  return context.length > 180 ? `${context.slice(0, 177)}…` : context;
}

export function priorityLabel(priority: AiOperationalAlert["priority"]) {
  if (priority === "high") {
    return "Segera";
  }

  if (priority === "medium") {
    return "Hari ini";
  }

  return "Info";
}
