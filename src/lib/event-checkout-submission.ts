export type FrozenEventSubmission = {
  fingerprint: string;
  key: string;
  payload: Record<string, unknown>;
  cartSignature: string;
};

/** Snapshot the JSON actually sent, so timers or later form edits cannot mutate a retry. */
export function freezeEventSubmission(payload: Record<string, unknown>, key: string, cartSignature: string): FrozenEventSubmission {
  const fingerprint = JSON.stringify(payload);
  return { fingerprint, key, payload: JSON.parse(fingerprint) as Record<string, unknown>, cartSignature };
}

/** A server may have committed before a transport/5xx error reached the customer. */
export function checkoutNeedsRecovery(status?: number) {
  return status === undefined || status >= 500;
}

// These errors originate after durable replay lookup in createCustomerOrder;
// its failure handler reconciles again under the event lock before returning.
// Auth, schema, fingerprint conflicts and unknown errors cannot prove rejection.
const definitiveCheckoutRejections: Record<string, readonly number[]> = {
  EVENT_NOT_FOUND: [404],
  EVENT_NOT_ACTIVE: [409],
  EVENT_MENU_UNAVAILABLE: [409],
  EVENT_MENU_QUOTA: [409],
  EVENT_SELECTION_INVALID: [400],
  EVENT_PRODUCT_UNAVAILABLE: [409],
  EVENT_PRODUCT_HIDDEN: [409],
  EVENT_CART_TOO_LARGE: [400],
  EVENT_CART_EMPTY: [400],
  EVENT_MENU_OVERLAP: [409],
  TABLE_CLEANING: [409],
  TABLE_OCCUPIED: [409],
  TABLE_JOIN_CODE_INVALID: [409],
  TABLE_RESERVED: [409],
  TABLE_HELD: [409],
};

export function checkoutRejectionIsDefinitive(code?: string, status?: number) {
  return Boolean(code && status !== undefined && definitiveCheckoutRejections[code]?.includes(status));
}

export function restoreEventSubmission(value: string | null): FrozenEventSubmission | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FrozenEventSubmission>;
    if (typeof parsed.key !== "string" || parsed.key.length < 8 || typeof parsed.fingerprint !== "string" || typeof parsed.cartSignature !== "string" || !parsed.payload || typeof parsed.payload !== "object" || Array.isArray(parsed.payload) || typeof parsed.payload.eventId !== "string" || !parsed.payload.eventId || JSON.stringify(parsed.payload) !== parsed.fingerprint) return null;
    return parsed as FrozenEventSubmission;
  } catch { return null; }
}
