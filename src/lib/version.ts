// Versão atual do build carregado no navegador.
// Ao publicar uma nova versão pela Central Administrativa (/admin/versoes),
// incremente também este número em código para que o cliente e o servidor
// possam comparar corretamente.
export const APP_VERSION = "2.0.0";

/** Compara duas versões semver simples (major.minor.patch). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/** Hash estável 0-99 (bucket para rollout gradual). */
export function bucketFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}
