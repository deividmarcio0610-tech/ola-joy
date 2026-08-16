import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { STRATEGY_VERSION } from "@/lib/engines/strategy";
import {
  getDatabase,
  getProductionTechnique,
  promoteTechniqueCandidate,
  resetTradingRepositoryForTests,
  upsertTechniqueCandidate,
} from "./tradingRepository";
import {
  rollbackTechnique,
  techniqueBootstrapDiagnostic,
  techniqueHistory,
} from "./techniqueRegistry";

let workingDir: string | null = null;

function freshDatabase(): void {
  resetTradingRepositoryForTests();
  const dir = mkdtempSync(join(tmpdir(), "t4-technique-"));
  workingDir = dir;
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_PATH;
}

/**
 * RESTART REAL do backend: fecha o SQLite e reabre o MESMO arquivo, o que
 * reexecuta migrate() + bootstrapTechniques exatamente como um `pm2 restart`.
 */
function restartBackend(): void {
  resetTradingRepositoryForTests();
  getDatabase();
}

function validatedCandidate(version: string, id = "cand_1") {
  upsertTechniqueCandidate({
    id,
    version,
    baseVersion: STRATEGY_VERSION,
    hypothesis: `hipótese ${version}`,
    status: "VALIDATED",
    rules: { gates: { minRR: 3 }, marker: version },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  });
  return id;
}

afterEach(() => {
  resetTradingRepositoryForTests();
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
});

describe.sequential("técnica ativa — banco é a fonte de verdade", () => {
  it("STRATEGY_VERSION semeia SOMENTE banco vazio", () => {
    freshDatabase();
    const active = getProductionTechnique();
    expect(active?.version).toBe(STRATEGY_VERSION);
    expect(active?.origin).toBe("BOOTSTRAP");
    expect(techniqueBootstrapDiagnostic().action).toBe("SEEDED_EMPTY");
  });

  it("RESTART mantém a técnica promovida — causa raiz da pendência", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.1.0"));
    expect(getProductionTechnique()?.version).toBe("T4.1.0");

    restartBackend();

    // Antes da correção o boot arquivava a promovida e reinstalava a versão
    // do código: o aprendizado do T4 sumia em cada restart.
    const afterRestart = getProductionTechnique();
    expect(afterRestart?.version).toBe("T4.1.0");
    expect(afterRestart?.origin).toBe("PROMOTION");
    expect(techniqueBootstrapDiagnostic().action).toBe("KEPT_PERSISTED");
    expect(techniqueBootstrapDiagnostic().activeVersion).toBe("T4.1.0");
  });

  it("promoção sobrevive a vários restarts seguidos", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.2.0"));
    for (let i = 0; i < 3; i++) {
      restartBackend();
      expect(getProductionTechnique()?.version).toBe("T4.2.0");
    }
  });

  it("boot registra a versão do código no histórico SEM promovê-la", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.3.0"));
    restartBackend();
    const history = techniqueHistory();
    const embedded = history.find((item) => item.version === STRATEGY_VERSION);
    expect(embedded).toBeDefined();
    expect(embedded?.status).toBe("ARCHIVED");
    expect(history.find((item) => item.status === "PRODUCTION")?.version).toBe("T4.3.0");
  });

  it("regras de uma técnica promovida não são sobrescritas pelo perfil do código", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.4.0"));
    restartBackend();
    expect(getProductionTechnique()?.rules.marker).toBe("T4.4.0");
  });

  it("promoção é atômica: candidata não VALIDATED é recusada sem alterar a ativa", () => {
    freshDatabase();
    upsertTechniqueCandidate({
      id: "cand_x",
      version: "T4.9.9",
      baseVersion: STRATEGY_VERSION,
      hypothesis: "ainda em teste",
      status: "BACKTESTING",
      rules: {},
      createdAt: 1,
      updatedAt: 1,
    });
    expect(() => promoteTechniqueCandidate("cand_x")).toThrow(/VALIDATED/);
    expect(getProductionTechnique()?.version).toBe(STRATEGY_VERSION);
  });
});

describe.sequential("rollback explícito e auditoria", () => {
  it("rollback reativa versão anterior e é auditado", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.5.0"));
    const restored = rollbackTechnique({
      version: STRATEGY_VERSION,
      actor: "admin",
      reason: "regressão observada no pregão",
    });
    expect(restored.version).toBe(STRATEGY_VERSION);
    expect(restored.origin).toBe("ROLLBACK");
    expect(restored.actor).toBe("admin");
    expect(restored.notes).toContain("regressão");
    expect(restored.previousVersion).toBe("T4.5.0");
  });

  it("rollback sobrevive a restart (não volta para a promovida)", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.6.0"));
    rollbackTechnique({ version: STRATEGY_VERSION, actor: "admin", reason: "rollback" });
    restartBackend();
    expect(getProductionTechnique()?.version).toBe(STRATEGY_VERSION);
    expect(getProductionTechnique()?.origin).toBe("ROLLBACK");
  });

  it("rollback exige versão existente e motivo — nunca acontece sozinho", () => {
    freshDatabase();
    expect(() =>
      rollbackTechnique({ version: "inexistente", actor: "admin", reason: "x" }),
    ).toThrow(/não existe no histórico/);
    promoteTechniqueCandidate(validatedCandidate("T4.7.0"));
    expect(() =>
      rollbackTechnique({ version: STRATEGY_VERSION, actor: "admin", reason: "   " }),
    ).toThrow(/motivo/);
  });

  it("nada é apagado: histórico preserva todas as versões e a trilha", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.8.0", "c1"));
    promoteTechniqueCandidate(validatedCandidate("T4.8.1", "c2"));
    rollbackTechnique({ version: "T4.8.0", actor: "admin", reason: "voltar" });
    const versions = techniqueHistory().map((item) => item.version);
    expect(versions).toContain(STRATEGY_VERSION);
    expect(versions).toContain("T4.8.0");
    expect(versions).toContain("T4.8.1");
    const active = techniqueHistory().filter((item) => item.status === "PRODUCTION");
    expect(active).toHaveLength(1);
    expect(active[0]!.version).toBe("T4.8.0");
  });
});

describe.sequential("estados degradados não destroem dados válidos", () => {
  it("regras corrompidas NÃO são substituídas — o problema é exposto", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.C.0"));
    getDatabase()
      .prepare("UPDATE techniques SET rules_json='{corrompido' WHERE version=?")
      .run("T4.C.0");

    restartBackend();

    const active = getProductionTechnique();
    expect(active?.version).toBe("T4.C.0"); // continua ativa, não foi trocada
    expect(active?.rulesValid).toBe(false);
    expect(techniqueBootstrapDiagnostic().problem).toContain("corrompidas");
    // E o rollback recusa ativar dados inválidos.
    rollbackTechnique({ version: STRATEGY_VERSION, actor: "admin", reason: "corrompida" });
    expect(() =>
      rollbackTechnique({ version: "T4.C.0", actor: "admin", reason: "tentar de novo" }),
    ).toThrow(/corrompidas/);
  });

  it("histórico sem PRODUCTION não promove nada automaticamente no boot", () => {
    freshDatabase();
    promoteTechniqueCandidate(validatedCandidate("T4.D.0"));
    getDatabase().prepare("UPDATE techniques SET status='ARCHIVED'").run();

    restartBackend();

    // Promover algo aqui seria um rollback automático — proibido.
    expect(getProductionTechnique()).toBeNull();
    expect(techniqueBootstrapDiagnostic().action).toBe("NO_PRODUCTION_FOUND");
    expect(techniqueBootstrapDiagnostic().problem).toContain("nenhuma está em PRODUCTION");
  });
});
