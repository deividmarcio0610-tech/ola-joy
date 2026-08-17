// Client-side helper: compute trust score from a profile snapshot and counts.
// Kept as a pure function so we can render badges without a round-trip.

export type TrustInputs = {
  hasAvatar: boolean;
  hasName: boolean;
  hasCity: boolean;
  hasPhone: boolean;
  hasBio: boolean;
  accountAgeDays: number;
  activeListings: number;
  completedMatches: number;
};

export function computeTrustScore(i: TrustInputs): number {
  let s = 10;
  if (i.hasAvatar) s += 15;
  if (i.hasName) s += 10;
  if (i.hasCity) s += 5;
  if (i.hasPhone) s += 10;
  if (i.hasBio) s += 5;
  s += Math.min(15, Math.floor(i.accountAgeDays / 7) * 3); // até 15 pts em ~5 sem
  s += Math.min(15, i.activeListings * 3);
  s += Math.min(15, i.completedMatches * 5);
  return Math.max(0, Math.min(100, s));
}

export function trustLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "Confiável", color: "text-emerald-700", bg: "bg-emerald-100" };
  if (score >= 60) return { label: "Verificado", color: "text-blue-700", bg: "bg-blue-100" };
  if (score >= 40) return { label: "Novo", color: "text-amber-700", bg: "bg-amber-100" };
  return { label: "Sem histórico", color: "text-slate-600", bg: "bg-slate-100" };
}

export type TrustTier = "diamond" | "gold" | "silver" | "bronze" | "new";

export function trustTier(score: number): {
  tier: TrustTier;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  ring: string;
} {
  if (score >= 90)
    return {
      tier: "diamond",
      label: "Vizinho Diamante",
      emoji: "💎",
      color: "text-cyan-700",
      bg: "bg-cyan-100",
      ring: "ring-cyan-400",
    };
  if (score >= 75)
    return {
      tier: "gold",
      label: "Vizinho Ouro",
      emoji: "🥇",
      color: "text-yellow-700",
      bg: "bg-yellow-100",
      ring: "ring-yellow-400",
    };
  if (score >= 55)
    return {
      tier: "silver",
      label: "Vizinho Prata",
      emoji: "🥈",
      color: "text-slate-700",
      bg: "bg-slate-200",
      ring: "ring-slate-400",
    };
  if (score >= 30)
    return {
      tier: "bronze",
      label: "Vizinho Bronze",
      emoji: "🥉",
      color: "text-orange-700",
      bg: "bg-orange-100",
      ring: "ring-orange-400",
    };
  return {
    tier: "new",
    label: "Novo vizinho",
    emoji: "🌱",
    color: "text-slate-600",
    bg: "bg-slate-100",
    ring: "ring-slate-300",
  };
}

export function fraudLabel(
  score: number | null | undefined,
): { label: string; color: string; bg: string } | null {
  if (score == null) return null;
  if (score >= 75)
    return { label: "Anúncio verificado", color: "text-emerald-700", bg: "bg-emerald-100" };
  if (score >= 50) return { label: "Atenção", color: "text-amber-700", bg: "bg-amber-100" };
  return { label: "Alto risco de golpe", color: "text-red-700", bg: "bg-red-100" };
}
