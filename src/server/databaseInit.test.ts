import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetTradingRepositoryForTests } from "./tradingRepository";

/**
 * REGRESSÃO (auditoria de deploy): uma migração que falha NÃO pode publicar o
 * singleton com o schema pela metade. Antes da correção, `singleton` era
 * atribuído ANTES de migrate(); um erro deixava o processo de pé devolvendo
 * para sempre a mesma conexão meio-migrada — e toda requisição estourava
 * "no such column" até alguém reiniciar o PM2 sem saber por quê.
 */

let workingDir: string | null = null;

afterEach(() => {
  resetTradingRepositoryForTests();
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
});

describe.sequential("inicialização do banco resiste a falha de migração", () => {
  it("arquivo inválido: falha propaga e a tentativa seguinte NÃO recebe conexão envenenada", () => {
    workingDir = mkdtempSync(join(tmpdir(), "t4-dbinit-"));
    process.env.DATA_DIR = workingDir;
    const corrupted = join(workingDir, "corrompido.sqlite");
    writeFileSync(corrupted, "isto definitivamente nao e um banco sqlite valido");
    process.env.DATABASE_PATH = corrupted;

    // 1ª tentativa: erro real sobe para quem chamou.
    expect(() => getDatabase()).toThrow();
    // 2ª tentativa: precisa ERRAR DE NOVO (retentou), nunca devolver silenciosamente
    // uma conexão sem schema — que era o sintoma do singleton envenenado.
    expect(() => getDatabase()).toThrow();
  });

  it("depois de apontar para um caminho íntegro, a migração completa normalmente", () => {
    workingDir = mkdtempSync(join(tmpdir(), "t4-dbinit-ok-"));
    process.env.DATA_DIR = workingDir;
    const corrupted = join(workingDir, "corrompido.sqlite");
    writeFileSync(corrupted, "lixo");
    process.env.DATABASE_PATH = corrupted;
    expect(() => getDatabase()).toThrow();

    // O processo se recupera sem restart quando a causa raiz sai do caminho.
    resetTradingRepositoryForTests();
    process.env.DATABASE_PATH = join(workingDir, "novo.sqlite");
    const database = getDatabase();
    const row = database
      .prepare("SELECT COUNT(*) AS n FROM techniques WHERE status='PRODUCTION'")
      .get() as { n: number };
    expect(Number(row.n)).toBe(1);
  });
});
