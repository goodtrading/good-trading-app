import { describe, expect, it } from "vitest";

import {
  formatMicroTransitionZone,
  readMicroTransitionZone,
} from "@/lib/market-state/transitionZoneView";

describe("transitionZoneView", () => {
  it("formats numeric transition range", () => {
    expect(
      formatMicroTransitionZone({
        value: "62796-64320",
        status: "available",
      }),
    ).toBe("62,796 - 64,320");
  });

  it("formats k-suffixed transition range", () => {
    expect(
      formatMicroTransitionZone({
        value: "84k-85k",
        status: "available",
      }),
    ).toBe("84,000 - 85,000");
  });

  it("returns null when unavailable", () => {
    expect(
      formatMicroTransitionZone({
        value: "84k-85k",
        status: "unavailable",
      }),
    ).toBeNull();
  });

  it("reads from micro context", () => {
    const value = readMicroTransitionZone({
      localTransitionZone: { value: "62796-64320", status: "available" },
    } as never);
    expect(value).toBe("62,796 - 64,320");
  });
});
