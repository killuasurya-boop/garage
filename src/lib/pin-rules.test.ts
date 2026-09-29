import { describe, expect, it } from "vitest";

import { isWeakPin, validateApprovalPin } from "@/lib/pin-rules";

describe("pin-rules", () => {
  it("menolak format selain 4-8 digit angka", () => {
    expect(validateApprovalPin("123")).not.toBeNull();
    expect(validateApprovalPin("123456789")).not.toBeNull();
    expect(validateApprovalPin("12a4")).not.toBeNull();
    expect(validateApprovalPin("")).not.toBeNull();
  });

  it("menolak PIN lemah: digit sama atau berurutan", () => {
    for (const pin of ["0000", "1111", "999999", "1234", "3456", "123456", "4321", "987654"]) {
      expect(isWeakPin(pin)).toBe(true);
      expect(validateApprovalPin(pin)).toMatch(/mudah ditebak/);
    }
  });

  it("menerima PIN yang wajar", () => {
    for (const pin of ["2580", "7391", "120394", "90817263"]) {
      expect(isWeakPin(pin)).toBe(false);
      expect(validateApprovalPin(pin)).toBeNull();
    }
  });
});
