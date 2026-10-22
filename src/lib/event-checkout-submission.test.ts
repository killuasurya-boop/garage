import { describe, expect, it } from "vitest";
import { checkoutNeedsRecovery, checkoutRejectionIsDefinitive, freezeEventSubmission, restoreEventSubmission } from "@/lib/event-checkout-submission";

describe("uncertain event checkout recovery", () => {
  it("retains the original event payload and key after clock/context and cart edits", () => {
    const payload = { eventId: "active-event", items: [{ itemId: "coffee", variantId: "cold", qty: 1 }], eventItems: [], guestName: "Tamu" };
    const frozen = freezeEventSubmission(payload, "original-durable-key", "original-cart");
    payload.items[0].qty = 3;
    payload.eventId = "";
    payload.guestName = "Changed after timeout";
    expect(frozen.key).toBe("original-durable-key");
    expect(frozen.payload).toEqual({ eventId: "active-event", items: [{ itemId: "coffee", variantId: "cold", qty: 1 }], eventItems: [], guestName: "Tamu" });
    expect(frozen.fingerprint).toBe(JSON.stringify(frozen.payload));
    expect(frozen.cartSignature).toBe("original-cart");
  });
  it("matches wire JSON and retains nested bundle selections", () => {
    const payload = { eventId: "event", optional: undefined, eventItems: [{ entryId: "bundle", selections: [{ groupId: "drink", itemId: "coffee" }] }] };
    const frozen = freezeEventSubmission(payload, "stable-key", "cart");
    payload.eventItems[0].selections[0].itemId = "changed";
    expect(frozen.payload).not.toHaveProperty("optional");
    expect(frozen.payload.eventItems).toEqual([{ entryId: "bundle", selections: [{ groupId: "drink", itemId: "coffee" }] }]);
  });
  it("requires reconciliation for unknown transport and 5xx outcomes, not explicit 4xx rejection", () => {
    expect(checkoutNeedsRecovery()).toBe(true);
    expect(checkoutNeedsRecovery(500)).toBe(true);
    expect(checkoutNeedsRecovery(503)).toBe(true);
    expect(checkoutNeedsRecovery(400)).toBe(false);
    expect(checkoutNeedsRecovery(409)).toBe(false);
    expect(checkoutNeedsRecovery(401)).toBe(false);
  });
  it("restores the same wire payload/key after refresh and rejects damaged session data", () => {
    const frozen = freezeEventSubmission({ eventId: "expired-event", items: [{ itemId: "regular", qty: 1 }] }, "durable-key", "cart");
    expect(restoreEventSubmission(JSON.stringify(frozen))).toEqual(frozen);
    expect(restoreEventSubmission("not JSON")).toBeNull();
    expect(restoreEventSubmission(JSON.stringify({ ...frozen, payload: { ...frozen.payload, eventId: "other-event" } }))).toBeNull();
    expect(restoreEventSubmission(JSON.stringify({ ...frozen, payload: null }))).toBeNull();
  });
  it("releases recovery only for reconciled event and table rejections", () => {
    expect(checkoutRejectionIsDefinitive("EVENT_NOT_ACTIVE", 409)).toBe(true);
    expect(checkoutRejectionIsDefinitive("EVENT_MENU_QUOTA", 409)).toBe(true);
    expect(checkoutRejectionIsDefinitive("EVENT_SELECTION_INVALID", 400)).toBe(true);
    expect(checkoutRejectionIsDefinitive("TABLE_JOIN_CODE_INVALID", 409)).toBe(true);
    expect(checkoutRejectionIsDefinitive("TABLE_HELD", 409)).toBe(true);
    expect(checkoutRejectionIsDefinitive("EVENT_NOT_FOUND", 404)).toBe(true);
  });
  it("keeps recovery for auth, schema, unknown and ambiguous fingerprint failures", () => {
    for (const [code, status] of [["MEMBER_LOGIN_REQUIRED", 401], ["INVALID_BODY", 400], ["CUSTOMER_ORDER_CREATE_FAILED", 400], ["EVENT_MENU_QUOTA", 503], ["TABLE_UNKNOWN", 409], ["EVENT_NOT_ACTIVE", 401]] as const) {
      expect(checkoutRejectionIsDefinitive(code, status)).toBe(false);
    }
    expect(checkoutRejectionIsDefinitive()).toBe(false);
    expect(checkoutRejectionIsDefinitive("EVENT_NOT_ACTIVE")).toBe(false);
  });
});
