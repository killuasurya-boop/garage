import { normalizePhone } from "@/lib/member-types";
import type { AppSettings } from "@/lib/garage-service";
import type { AiOperationalAlertPriority } from "@/lib/garage-api-types";
import type { Role } from "@/lib/garage-data";

export type AiWhatsappTarget = {
  phone: string;
  url: string;
  roleGroup: AiPhoneGroup;
};

export type AiPhoneGroup = "cashier" | "kitchen" | "inventory" | "management";

const CASHIER_ROLES: Role[] = [
  "Kasir",
  "Waiter 1",
  "Waiter 2",
  "Supervisor Shift",
];

const KITCHEN_ROLES: Role[] = [
  "Barista",
  "Koki",
  "Asisten Koki",
  "Kitchen / Barista",
];

const INVENTORY_ROLES: Role[] = ["Gudang"];

const MANAGEMENT_ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
];

export function getJakartaHour(date = new Date()) {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    hour12: false,
  }).format(date);

  return Number(hourText);
}

export function isWithinAutopilotHours(
  settings: Pick<
    AppSettings,
    "aiAutopilotEnabled" | "aiAutopilotStartHour" | "aiAutopilotEndHour"
  >,
  date = new Date(),
) {
  if (!settings.aiAutopilotEnabled) {
    return false;
  }

  const hour = getJakartaHour(date);
  const start = settings.aiAutopilotStartHour;
  const end = settings.aiAutopilotEndHour;

  if (start === end) {
    return true;
  }

  if (start < end) {
    return hour >= start && hour < end;
  }

  return hour >= start || hour < end;
}

export function autopilotHoursLabel(
  settings: Pick<AppSettings, "aiAutopilotStartHour" | "aiAutopilotEndHour">,
) {
  return `${String(settings.aiAutopilotStartHour).padStart(2, "0")}:00 – ${String(settings.aiAutopilotEndHour).padStart(2, "0")}:00 WIB`;
}

function normalizeWhatsappPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }

  return digits;
}

export function parsePhoneList(raw: string) {
  return raw
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((phone) => normalizePhone(phone))
    .filter((phone) => phone.length >= 10);
}

function phoneGroupForRole(role: Role): AiPhoneGroup | null {
  if (CASHIER_ROLES.includes(role)) {
    return "cashier";
  }

  if (KITCHEN_ROLES.includes(role)) {
    return "kitchen";
  }

  if (INVENTORY_ROLES.includes(role)) {
    return "inventory";
  }

  if (MANAGEMENT_ROLES.includes(role)) {
    return "management";
  }

  return null;
}

function phonesForGroup(settings: AppSettings, group: AiPhoneGroup) {
  const raw =
    group === "cashier"
      ? settings.aiWhatsappPhonesCashier
      : group === "kitchen"
        ? settings.aiWhatsappPhonesKitchen
        : group === "inventory"
          ? settings.aiWhatsappPhonesGudang
          : settings.aiWhatsappPhonesManagement;

  return parsePhoneList(raw);
}

function renderTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export function buildAiAlertWhatsappMessage(
  settings: AppSettings,
  input: {
    title: string;
    detail: string;
    priority: AiOperationalAlertPriority;
    roleGroup: AiPhoneGroup;
  },
) {
  return renderTemplate(settings.aiWhatsappAlertTemplate, {
    brand: settings.brandName,
    title: input.title,
    detail: input.detail,
    priority: input.priority,
    role: input.roleGroup,
  });
}

export function buildAiAlertWhatsappUrl(phone: string, message: string) {
  return `https://wa.me/${normalizeWhatsappPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function resolveWhatsappTargetsForRoles(
  settings: AppSettings,
  targetRoles: Role[],
  alert: {
    title: string;
    detail: string;
    priority: AiOperationalAlertPriority;
  },
): AiWhatsappTarget[] {
  if (!settings.aiWhatsappHighAlerts || alert.priority !== "high") {
    return [];
  }

  const groups = new Set<AiPhoneGroup>();
  for (const role of targetRoles) {
    const group = phoneGroupForRole(role);
    if (group) {
      groups.add(group);
    }
  }

  const targets: AiWhatsappTarget[] = [];
  for (const group of groups) {
    const phones = phonesForGroup(settings, group);
    const message = buildAiAlertWhatsappMessage(settings, {
      title: alert.title,
      detail: alert.detail,
      priority: alert.priority,
      roleGroup: group,
    });

    for (const phone of phones) {
      targets.push({
        phone,
        roleGroup: group,
        url: buildAiAlertWhatsappUrl(phone, message),
      });
    }
  }

  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.roleGroup}:${target.phone}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function whatsappTargetsForViewer(
  targets: AiWhatsappTarget[],
  role: Role,
) {
  const group = phoneGroupForRole(role);
  if (!group) {
    return targets;
  }

  return targets.filter((target) => target.roleGroup === group);
}
