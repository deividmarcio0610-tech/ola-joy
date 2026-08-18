/**
 * RNG DETERMINÍSTICO — reprodutibilidade é requisito, não conveniência.
 *
 * Bootstrap e Monte Carlo precisam devolver EXATAMENTE o mesmo resultado para
 * a mesma seed e o mesmo dataset; caso contrário nenhuma conclusão estatística
 * é auditável. `Math.random()` é proibido em todo o subsistema de validação.
 *
 * mulberry32: gerador de 32 bits, rápido, período 2^32, qualidade suficiente
 * para reamostragem (não é criptográfico e não precisa ser).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estável de string → semente inteira. Mesma string, mesma semente. */
export function seedFromString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Índice inteiro em [0, size). */
export function randomIndex(next: () => number, size: number): number {
  return Math.min(size - 1, Math.floor(next() * size));
}
