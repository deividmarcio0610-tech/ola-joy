import { beforeEach, describe, expect, it } from "vitest";

import {
  captureDegradationReason,
  overlayAlreadyShown,
  resetOverlayGateForTests,
  shouldShowConfirmationOverlay,
} from "../overlayGate";
import { hasPlayed, playConfirmationOnce, resetSignalSoundForTests } from "../signalSound";

describe("alerta visual ENTRADA CONFIRMADA — 1× por signalId (comando gerenciamento §5)", () => {
  beforeEach(() => resetOverlayGateForTests());

  it("dispara na PRIMEIRA confirmação e nunca mais para o mesmo signalId", () => {
    expect(shouldShowConfirmationOverlay("sig_WINFUT_1700000000000_COMPRA")).toBe(true);
    // Re-render, novo frame, troca de rota: nada disso repete o alerta.
    expect(shouldShowConfirmationOverlay("sig_WINFUT_1700000000000_COMPRA")).toBe(false);
    expect(shouldShowConfirmationOverlay("sig_WINFUT_1700000000000_COMPRA")).toBe(false);
    expect(overlayAlreadyShown("sig_WINFUT_1700000000000_COMPRA")).toBe(true);
  });

  it("um signalId NOVO dispara um novo alerta", () => {
    expect(shouldShowConfirmationOverlay("sig_a")).toBe(true);
    expect(shouldShowConfirmationOverlay("sig_b")).toBe(true);
  });

  it("sem signalId não há alerta", () => {
    expect(shouldShowConfirmationOverlay(null)).toBe(false);
    expect(shouldShowConfirmationOverlay(undefined)).toBe(false);
    expect(shouldShowConfirmationOverlay("")).toBe(false);
  });
});

describe("som — exatamente 1× por signalId (comando gerenciamento §6/§12.d)", () => {
  beforeEach(() => resetSignalSoundForTests());

  it("segunda chamada com o mesmo signalId não toca de novo", () => {
    // Sem AudioContext no ambiente de teste o play retorna false, mas o
    // dedupe é registrado ANTES: o contrato 1×/signalId é o que importa.
    playConfirmationOnce("sig_x", "COMPRA", true);
    expect(hasPlayed("sig_x")).toBe(true);
    expect(playConfirmationOnce("sig_x", "COMPRA", true)).toBe(false);
  });

  it("com som desligado nada é consumido nem tocado", () => {
    expect(playConfirmationOnce("sig_y", "VENDA", false)).toBe(false);
    expect(hasPlayed("sig_y")).toBe(false);
  });
});

describe("recuperação/degradação da stream (comando ao-vivo §4)", () => {
  it("capturando com frames recentes = sem pausa", () => {
    expect(
      captureDegradationReason({
        status: "capturando",
        error: null,
        lastFrameAt: 1_000,
        now: 2_000,
      }),
    ).toBeNull();
  });

  it("janela minimizada (sem frames novos >5s) expõe o motivo real", () => {
    const reason = captureDegradationReason({
      status: "capturando",
      error: null,
      lastFrameAt: 1_000,
      now: 10_000,
    });
    expect(reason).toContain("parou de fornecer frames");
  });

  it("stream pausada/encerrada mostra o motivo e some quando volta a capturar", () => {
    expect(
      captureDegradationReason({
        status: "pausado",
        error: "A janela deixou de fornecer frames. Restaure-a ou selecione novamente.",
        lastFrameAt: 1_000,
        now: 2_000,
      }),
    ).toContain("deixou de fornecer frames");
    // Recuperação (unmute/resume → capturando com frame novo): overlay some.
    expect(
      captureDegradationReason({
        status: "capturando",
        error: null,
        lastFrameAt: 9_900,
        now: 10_000,
      }),
    ).toBeNull();
  });

  it("sem fonte selecionada a análise declara a pausa", () => {
    expect(
      captureDegradationReason({ status: "sem-fonte", error: null, lastFrameAt: null }),
    ).toContain("Nenhuma janela");
  });
});
