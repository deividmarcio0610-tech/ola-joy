import { describe, expect, it } from "vitest";

import { mulberry32, randomIndex, seedFromString } from "./rng";

describe("RNG determinístico (requisito de reprodutibilidade)", () => {
  it("mesma seed produz EXATAMENTE a mesma sequência", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("seeds diferentes divergem", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("valores ficam em [0,1)", () => {
    const next = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("seedFromString é estável entre execuções", () => {
    expect(seedFromString("T4.0.0|cfg")).toBe(seedFromString("T4.0.0|cfg"));
    expect(seedFromString("a")).not.toBe(seedFromString("b"));
  });

  it("randomIndex nunca sai do intervalo", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const index = randomIndex(next, 10);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(10);
    }
  });
});
