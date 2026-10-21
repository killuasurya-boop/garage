export type EventMenuGroup = {
  id: string;
  name: string;
  quantity: number;
  options: Array<{ itemId: string; variantId: string }>;
};

export type EventMenuEntry = {
  id: string;
  eventId: string;
  kind: "item" | "bundle";
  name: string;
  description: string | null;
  menuItemId: string | null;
  variantId: string | null;
  price: number;
  status: "active" | "inactive" | "archived";
  startsAt: string;
  endsAt: string;
  quota: number | null;
  usedQuantity: number;
  sortOrder: number;
  groups: EventMenuGroup[];
};

export type EventCartItem = {
  entryId: string;
  qty: number;
  note?: string;
  selections?: Array<{ groupId: string; itemId: string; variantId: string }>;
};

export type EventOrderSnapshot = {
  eventId: string;
  eventTitle: string;
  entryId: string;
  entryName: string;
  kind: "item" | "bundle";
  /** Shared by component lines of one submitted package line. */
  groupId: string;
  entryQuantity: number;
  componentIndex: number;
  componentCount: number;
  /** Historical unit cost; null means the cost was not verified. */
  unitCost: number | null;
  packagePrice: number;
};

export type ResolvedEventLine = {
  itemId: string;
  variantId: string;
  qty: number;
  note?: string;
  price: number;
  lineTotal: number;
  eventSnapshot: EventOrderSnapshot;
};

export type EventMenuProduct = {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  description: string | null;
  stock: string;
  /** Hiding a standalone product does not disable its use as a bundle component. */
  showInDigitalMenu?: boolean;
  variants: Array<{ id: string; label: string; price: number }>;
};

export type EventMenuContext = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  outletId: string | null;
  bannerUrl: string | null;
  phase: "upcoming" | "active" | "ended" | "unavailable";
};

export type EventMenuData = {
  event: EventMenuContext;
  entries: EventMenuEntry[];
  products: EventMenuProduct[];
};
