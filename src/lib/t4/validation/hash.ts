/**
 * HASH ESTÁVEL — base da reprodutibilidade auditável.
 *
 * Dois runs sobre a MESMA configuração e o MESMO dataset precisam produzir
 * exatamente os mesmos identificadores; qualquer mudança de peso, parâmetro ou
 * candle precisa mudá-los. Por isso a serialização ordena chaves de objeto:
 * `{a:1,b:2}` e `{b:2,a:1}` são a mesma configuração e não podem gerar hashes
 * diferentes.
 */

/** Serialização canônica: chaves ordenadas, arrays na ordem original. */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  if (typeof value === "number") {
    // -0 e 0 são a mesma configuração; NaN/Infinity viram marcadores explícitos.
    if (Number.isNaN(value)) return '"NaN"';
    if (!Number.isFinite(value)) return value > 0 ? '"Infinity"' : '"-Infinity"';
    return String(value === 0 ? 0 : value);
  }
  return JSON.stringify(value) ?? "null";
}

/** FNV-1a 32 bits — determinístico, sem dependência externa, sem Math.random. */
export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fnv1aHex(text: string): string {
  return fnv1a(text).toString(16).padStart(8, "0");
}

/** Hash de qualquer estrutura serializável, com prefixo legível. */
export function stableHash(prefix: string, value: unknown): string {
  return `${prefix}_${fnv1aHex(stableStringify(value))}`;
}
