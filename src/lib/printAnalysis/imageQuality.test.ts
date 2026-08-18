import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  analyzePixels,
  judgeImageQuality,
  parseImageDataUrl,
} from "./imageQuality";

/** Gera pixels sintéticos: `sharp` alterna colunas (bordas), `flat` é chapado. */
function pixels(width: number, height: number, kind: "sharp" | "flat"): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const value = kind === "sharp" ? (x % 2 === 0 ? 255 : 0) : 30;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return data;
}

describe("parseImageDataUrl", () => {
  it("aceita PNG, JPEG e WebP", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
      expect(parseImageDataUrl(`data:${mime};base64,QUJD`)?.mime).toBe(mime);
    }
  });

  it("normaliza image/jpg para image/jpeg", () => {
    expect(parseImageDataUrl("data:image/jpg;base64,QUJD")?.mime).toBe("image/jpeg");
  });

  it("recusa formatos que não são imagem conhecida", () => {
    expect(parseImageDataUrl("data:application/pdf;base64,QUJD")).toBeNull();
    expect(parseImageDataUrl("data:image/gif;base64,QUJD")).toBeNull();
    expect(parseImageDataUrl("https://exemplo/x.png")).toBeNull();
    expect(parseImageDataUrl("")).toBeNull();
  });

  it("calcula o tamanho em bytes descontando o padding", () => {
    // "QUJD" = "ABC" => 3 bytes, sem padding.
    expect(parseImageDataUrl("data:image/png;base64,QUJD")?.bytes).toBe(3);
    // "QUI=" = "AB" => 2 bytes, 1 de padding.
    expect(parseImageDataUrl("data:image/png;base64,QUI=")?.bytes).toBe(2);
  });
});

describe("analyzePixels", () => {
  it("imagem com bordas fortes tem nitidez alta", () => {
    const measured = analyzePixels(pixels(64, 64, "sharp"), 64, 64);
    expect(measured.sharpness).toBeGreaterThan(50);
  });

  it("imagem chapada tem nitidez ~0 e conteúdo ~0", () => {
    const measured = analyzePixels(pixels(64, 64, "flat"), 64, 64);
    expect(measured.sharpness).toBeLessThan(1);
    expect(measured.contentRatio).toBeLessThan(1);
  });

  it("não quebra em imagem minúscula", () => {
    expect(analyzePixels(pixels(2, 2, "sharp"), 2, 2)).toEqual({ sharpness: 0, contentRatio: 0 });
  });
});

describe("judgeImageQuality", () => {
  const good = { width: 1920, height: 1080, sharpness: 60, contentRatio: 40 };

  it("aprova um print bom", () => {
    const report = judgeImageQuality(good);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("reprova resolução abaixo do mínimo e explica o motivo", () => {
    const report = judgeImageQuality({
      ...good,
      width: MIN_IMAGE_WIDTH - 1,
      height: MIN_IMAGE_HEIGHT - 1,
    });
    expect(report.ok).toBe(false);
    expect(report.issues).toContain("RESOLUCAO_BAIXA");
    expect(report.reasons.join(" ")).toContain("candles ficam pequenos demais");
  });

  it("reprova imagem borrada", () => {
    const report = judgeImageQuality({ ...good, sharpness: 1 });
    expect(report.issues).toContain("BORRADA");
  });

  it("reprova imagem quase toda fundo", () => {
    const report = judgeImageQuality({ ...good, contentRatio: 0.5 });
    expect(report.issues).toContain("SEM_CONTEUDO");
  });

  it("reprova imagem acima do limite de tamanho", () => {
    const report = judgeImageQuality({ ...good, bytes: MAX_IMAGE_BYTES + 1 });
    expect(report.issues).toContain("GRANDE_DEMAIS");
  });

  it("acumula todos os problemas encontrados", () => {
    const report = judgeImageQuality({ width: 100, height: 100, sharpness: 0, contentRatio: 0 });
    expect(report.issues.length).toBe(3);
  });
});
