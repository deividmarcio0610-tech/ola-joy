// Fonte única do valor gravado em `records.module`.
//
// O enum vem da lista gerada do próprio banco (Constants), não de uma cópia escrita
// à mão: foi exatamente uma cópia divergente ("inspecao", que não existe no enum
// record_module) que fazia o Postgres recusar todo registro do módulo Inspeção.
//
// Import relativo de propósito — este módulo é coberto por tests/unit.test.ts, que
// roda no node puro, sem o alias "@/" do bundler.
import { Constants, type Database } from "../integrations/supabase/types.ts";

export type RecordModule = Database["public"]["Enums"]["record_module"];

export const RECORD_MODULES = Constants.public.Enums.record_module;

/**
 * Converte a chave de módulo usada na UI no valor aceito pelo banco.
 * Supervisão não tem registro próprio: por decisão de produto, é gravada como N3.
 */
export function toRecordModule(key: RecordModule): RecordModule {
  return key === "supervision" ? "n3" : key;
}

export function isRecordModule(value: string): value is RecordModule {
  return (RECORD_MODULES as readonly string[]).includes(value);
}
