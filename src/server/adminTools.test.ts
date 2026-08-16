import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { guardPath, projectRoot } from "./adminTools";

describe("Claude Admin — path guard (comando §18)", () => {
  it("bloqueia path traversal e diretórios do sistema", () => {
    expect(() => guardPath("../fora")).toThrow(/fora do diretório/i);
    expect(() => guardPath("../../etc/passwd")).toThrow(/fora do diretório/i);
    expect(() => guardPath("/etc/passwd")).toThrow(/fora do diretório|bloqueado/i);
  });

  it("bloqueia .env, .git, node_modules, chaves e credenciais", () => {
    expect(() => guardPath(".env")).toThrow(/bloqueado/i);
    expect(() => guardPath(".env.production")).toThrow(/bloqueado/i);
    expect(() => guardPath(".git/config")).toThrow(/bloqueado/i);
    expect(() => guardPath("node_modules/x/index.js")).toThrow(/bloqueado/i);
    expect(() => guardPath("deploy/id_rsa")).toThrow(/bloqueado/i);
    expect(() => guardPath("certs/server.key")).toThrow(/bloqueado/i);
  });

  it("permite arquivos normais do projeto", () => {
    expect(() => guardPath("src/lib/t4/progress.ts")).not.toThrow();
    expect(() => guardPath("package.json")).not.toThrow();
  });

  it("bloqueia escrita em arquivos gerenciados por ferramenta", () => {
    expect(() => guardPath("package-lock.json", { forWrite: true })).toThrow(/não editável/i);
  });

  /**
   * `resolve()` é léxico e NÃO segue symlink: antes da auditoria, um link
   * dentro do projeto apontando para fora passava no teste de prefixo e era
   * lido/escrito normalmente.
   */
  it("bloqueia symlink que escapa do projeto", () => {
    const dir = join(projectRoot(), ".tmp-audit-symlink");
    const outside = join(dir, "fuga");
    mkdirSync(dir, { recursive: true });
    try {
      symlinkSync("/etc", outside, "dir");
    } catch {
      return; // ambiente sem permissão para symlink: nada a verificar
    }
    expect(() => guardPath(".tmp-audit-symlink/fuga")).toThrow(/symlink/i);
  });

  it("permite arquivo real dentro do projeto mesmo com a checagem de symlink", () => {
    const dir = join(projectRoot(), ".tmp-audit-symlink");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "ok.txt");
    writeFileSync(file, "conteudo");
    expect(() => guardPath(".tmp-audit-symlink/ok.txt")).not.toThrow();
  });
});

afterAll(() => {
  rmSync(join(projectRoot(), ".tmp-audit-symlink"), { recursive: true, force: true });
});
