import type { DatabaseSync } from "node:sqlite";

import { STRATEGY_VERSION, T4_PROFILE } from "@/lib/engines/strategy";
import type { TechniqueRecord } from "@/lib/storage";

import { getDatabase } from "./tradingRepository";

/**
 * REGISTRO DE TÉCNICAS — O BANCO É A FONTE DE VERDADE.
 *
 * CAUSA RAIZ CORRIGIDA: o boot comparava a técnica de PRODUÇÃO com a
 * `STRATEGY_VERSION` do código e, ao ver qualquer diferença, ARQUIVAVA a
 * produção vigente e reinstalava a versão do código. Ou seja: promover uma
 * candidata validada valia até o próximo restart — o aprendizado do T4 era
 * silenciosamente descartado por um `pm2 restart`.
 *
 * REGRAS DEFINITIVAS:
 * - `STRATEGY_VERSION` é apenas BOOTSTRAP: semeia a tabela quando ela está
 *   VAZIA. Nunca sobrepõe uma técnica já persistida.
 * - Existindo uma PRODUCTION persistida, o boot NÃO a altera. A versão do
 *   código é apenas REGISTRADA no histórico (status ARCHIVED) para auditoria.
 * - Rollback é ação EXPLÍCITA e auditada (`rollbackTechnique`). Nunca acontece
 *   automaticamente no boot.
 * - Nada é apagado: promoções e rollbacks arquivam, jamais deletam.
 * - Estado inconsistente (histórico sem nenhuma PRODUCTION) ou regras
 *   corrompidas NÃO são "consertados" sobrescrevendo dados válidos: o problema
 *   é exposto em `techniqueBootstrapDiagnostic()` e os consumidores caem no
 *   fallback em memória, sem escrever no banco.
 */

export type TechniqueOrigin = "BOOTSTRAP" | "PROMOTION" | "ROLLBACK";

export interface TechniqueAuditRecord extends TechniqueRecord {
  /** Como esta versão chegou ao estado atual. */
  origin: TechniqueOrigin;
  /** Quem executou a ação (operador/admin). */
  actor: string | null;
  notes: string | null;
  /** Métricas que sustentaram a promoção (do candidato). */
  metrics: Record<string, unknown> | null;
  /** Versão que estava em produção imediatamente antes desta. */
  previousVersion: string | null;
  /** true quando `rules_json` é JSON válido. */
  rulesValid: boolean;
}

export interface TechniqueBootstrapDiagnostic {
  /** Ação tomada no boot. */
  action: "SEEDED_EMPTY" | "KEPT_PERSISTED" | "NO_PRODUCTION_FOUND";
  activeVersion: string | null;
  /** Preenchido quando o boot encontrou um estado que exige atenção humana. */
  problem: string | null;
}

let lastDiagnostic: TechniqueBootstrapDiagnostic = {
  action: "SEEDED_EMPTY",
  activeVersion: null,
  problem: null,
};

export function techniqueBootstrapDiagnostic(): TechniqueBootstrapDiagnostic {
  return lastDiagnostic;
}

const AUDIT_COLUMNS: Array<[string, string]> = [
  ["origin", "TEXT"],
  ["actor", "TEXT"],
  ["notes", "TEXT"],
  ["metrics_json", "TEXT"],
  ["previous_version", "TEXT"],
  ["superseded_at", "INTEGER"],
];

/** Migração idempotente das colunas de auditoria da tabela `techniques`. */
export function migrateTechniqueAuditColumns(database: DatabaseSync): void {
  const existing = new Set(
    (database.prepare("PRAGMA table_info(techniques)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  for (const [name, type] of AUDIT_COLUMNS) {
    if (!existing.has(name)) database.exec(`ALTER TABLE techniques ADD COLUMN ${name} ${type}`);
  }
}

function isValidJson(raw: unknown): boolean {
  try {
    JSON.parse(String(raw));
    return true;
  } catch {
    return false;
  }
}

/**
 * BOOT. Chamado uma vez por processo, dentro da migração.
 * NUNCA promove, arquiva ou reescreve uma técnica já persistida.
 */
export function bootstrapTechniques(database: DatabaseSync): TechniqueBootstrapDiagnostic {
  const now = Date.now();
  const total = Number(
    (database.prepare("SELECT COUNT(*) AS n FROM techniques").get() as { n: number }).n,
  );

  if (total === 0) {
    // Banco vazio: a versão do código semeia a produção inicial.
    database
      .prepare(
        `INSERT INTO techniques(version, status, rules_json, created_at, promoted_at, origin, actor, notes, previous_version)
         VALUES (?, 'PRODUCTION', ?, ?, ?, 'BOOTSTRAP', 'system', 'Semeadura inicial a partir da versão do código.', NULL)`,
      )
      .run(STRATEGY_VERSION, JSON.stringify(T4_PROFILE), now, now);
    lastDiagnostic = {
      action: "SEEDED_EMPTY",
      activeVersion: STRATEGY_VERSION,
      problem: null,
    };
    return lastDiagnostic;
  }

  const production = database
    .prepare(
      "SELECT version, rules_json, origin FROM techniques WHERE status='PRODUCTION' ORDER BY promoted_at DESC, created_at DESC LIMIT 1",
    )
    .get() as { version: string; rules_json: string; origin: string | null } | undefined;

  if (!production) {
    // Histórico existe mas nada está em produção. Promover algo aqui seria um
    // ROLLBACK AUTOMÁTICO — exatamente o que não pode acontecer. Exposto para
    // decisão humana; os consumidores usam o fallback em memória.
    lastDiagnostic = {
      action: "NO_PRODUCTION_FOUND",
      activeVersion: null,
      problem:
        "Existem técnicas registradas, porém nenhuma está em PRODUCTION. Nenhuma promoção automática foi feita — use o rollback explícito para reativar a versão desejada.",
    };
    return lastDiagnostic;
  }

  // A versão do código entra no HISTÓRICO (sem status de produção) para que a
  // auditoria mostre o que o binário atual traz, sem tocar na técnica ativa.
  database
    .prepare(
      `INSERT INTO techniques(version, status, rules_json, created_at, promoted_at, origin, actor, notes, previous_version)
       VALUES (?, 'ARCHIVED', ?, ?, NULL, 'BOOTSTRAP', 'system', 'Versão embarcada no código; não promovida automaticamente.', NULL)
       ON CONFLICT(version) DO NOTHING`,
    )
    .run(STRATEGY_VERSION, JSON.stringify(T4_PROFILE), now);

  // Atualizar as regras a partir do código só é legítimo para a linha semeada
  // pelo bootstrap. Uma versão que chegou por PROMOÇÃO carrega as regras
  // aprendidas e não pode ser sobrescrita pelo perfil do binário.
  if (production.version === STRATEGY_VERSION && production.origin !== "PROMOTION") {
    database
      .prepare("UPDATE techniques SET rules_json=? WHERE version=? AND status='PRODUCTION'")
      .run(JSON.stringify(T4_PROFILE), STRATEGY_VERSION);
  }

  lastDiagnostic = {
    action: "KEPT_PERSISTED",
    activeVersion: production.version,
    problem: isValidJson(production.rules_json)
      ? null
      : `A técnica ativa ${production.version} tem regras corrompidas no banco. Ela NÃO foi substituída — restaure o backup ou faça um rollback explícito.`,
  };
  return lastDiagnostic;
}

interface TechniqueRow {
  version: string;
  status: "PRODUCTION" | "ARCHIVED";
  rules_json: string;
  created_at: number;
  promoted_at: number | null;
  origin: string | null;
  actor: string | null;
  notes: string | null;
  metrics_json: string | null;
  previous_version: string | null;
}

function toAuditRecord(row: TechniqueRow): TechniqueAuditRecord {
  const rulesValid = isValidJson(row.rules_json);
  return {
    version: row.version,
    status: row.status,
    // Regras corrompidas nunca derrubam a leitura: a versão ativa continua
    // identificável e o problema aparece em `rulesValid`.
    rules: rulesValid ? (JSON.parse(row.rules_json) as Record<string, unknown>) : {},
    createdAt: row.created_at,
    promotedAt: row.promoted_at,
    origin: (row.origin as TechniqueOrigin) ?? "BOOTSTRAP",
    actor: row.actor,
    notes: row.notes,
    metrics:
      row.metrics_json && isValidJson(row.metrics_json)
        ? (JSON.parse(row.metrics_json) as Record<string, unknown>)
        : null,
    previousVersion: row.previous_version,
    rulesValid,
  };
}

const SELECT_COLUMNS =
  "version, status, rules_json, created_at, promoted_at, origin, actor, notes, metrics_json, previous_version";

/** Técnica ATIVA segundo o banco. null = nenhuma persistida (usar fallback). */
export function activeTechnique(): TechniqueAuditRecord | null {
  const row = getDatabase()
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM techniques WHERE status='PRODUCTION' ORDER BY promoted_at DESC, created_at DESC LIMIT 1`,
    )
    .get() as TechniqueRow | undefined;
  return row ? toAuditRecord(row) : null;
}

/** Histórico completo — nada é apagado, então isto é a trilha de auditoria. */
export function techniqueHistory(limit = 200): TechniqueAuditRecord[] {
  const rows = getDatabase()
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM techniques ORDER BY COALESCE(promoted_at, created_at) DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(1, limit), 500)) as unknown as TechniqueRow[];
  return rows.map(toAuditRecord);
}

/**
 * Troca a técnica ativa de forma ATÔMICA e auditada. Usada tanto pela promoção
 * quanto pelo rollback — a diferença está apenas na `origin` e na validação
 * que cada caminho faz antes de chamar.
 */
export function activateTechnique(input: {
  version: string;
  rulesJson: string;
  createdAt: number;
  origin: TechniqueOrigin;
  actor: string | null;
  notes: string | null;
  metricsJson?: string | null;
}): TechniqueAuditRecord {
  const database = getDatabase();
  const now = Date.now();
  const previous = database
    .prepare(
      "SELECT version FROM techniques WHERE status='PRODUCTION' ORDER BY promoted_at DESC, created_at DESC LIMIT 1",
    )
    .get() as { version: string } | undefined;

  database.exec("BEGIN IMMEDIATE");
  try {
    // Arquiva a anterior (histórico preservado, nada é removido).
    database
      .prepare("UPDATE techniques SET status='ARCHIVED', superseded_at=? WHERE status='PRODUCTION'")
      .run(now);
    database
      .prepare(
        `INSERT INTO techniques(version, status, rules_json, created_at, promoted_at, origin, actor, notes, metrics_json, previous_version, superseded_at)
         VALUES (?, 'PRODUCTION', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(version) DO UPDATE SET
           status='PRODUCTION',
           rules_json=excluded.rules_json,
           promoted_at=excluded.promoted_at,
           origin=excluded.origin,
           actor=excluded.actor,
           notes=excluded.notes,
           metrics_json=excluded.metrics_json,
           previous_version=excluded.previous_version,
           superseded_at=NULL`,
      )
      .run(
        input.version,
        input.rulesJson,
        input.createdAt,
        now,
        input.origin,
        input.actor,
        input.notes,
        input.metricsJson ?? null,
        previous?.version ?? null,
      );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return activeTechnique()!;
}

/**
 * ROLLBACK EXPLÍCITO. Só reativa versão que já existe no histórico e exige
 * ator + motivo — nunca acontece sozinho, nunca no boot.
 */
export function rollbackTechnique(input: {
  version: string;
  actor: string | null;
  reason: string;
}): TechniqueAuditRecord {
  const row = getDatabase()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM techniques WHERE version=?`)
    .get(input.version) as TechniqueRow | undefined;
  if (!row) {
    throw new Error(`Técnica ${input.version} não existe no histórico — rollback recusado.`);
  }
  if (!isValidJson(row.rules_json)) {
    throw new Error(
      `Técnica ${input.version} tem regras corrompidas no banco — rollback recusado para não ativar dados inválidos.`,
    );
  }
  if (row.status === "PRODUCTION") {
    throw new Error(`Técnica ${input.version} já está em produção.`);
  }
  if (!input.reason.trim()) throw new Error("Rollback exige um motivo para a auditoria.");
  return activateTechnique({
    version: row.version,
    rulesJson: row.rules_json,
    createdAt: row.created_at,
    origin: "ROLLBACK",
    actor: input.actor,
    notes: input.reason.trim().slice(0, 1_000),
  });
}
