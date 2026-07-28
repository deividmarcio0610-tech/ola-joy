import { Wrench, MapPin } from "lucide-react";

export type EquipArea = { equipamento: string; area: string };

export function EquipAreaFields({
  value,
  onChange,
  className = "",
}: {
  value: EquipArea;
  onChange: (v: EquipArea) => void;
  className?: string;
}) {
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-black/30 px-3 py-2 text-xs">
        <Wrench className="h-3.5 w-3.5 text-neon" />
        <input
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder="Equipamento / TAG"
          value={value.equipamento}
          onChange={(e) => onChange({ ...value, equipamento: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-black/30 px-3 py-2 text-xs">
        <MapPin className="h-3.5 w-3.5 text-neon" />
        <input
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder="Área / Local"
          value={value.area}
          onChange={(e) => onChange({ ...value, area: e.target.value })}
        />
      </label>
    </div>
  );
}

export function equipAreaPromptSuffix(v: EquipArea) {
  const parts: string[] = [];
  if (v.equipamento.trim()) parts.push(`Equipamento/TAG: ${v.equipamento.trim()}`);
  if (v.area.trim()) parts.push(`Área/Local: ${v.area.trim()}`);
  if (!parts.length) return "";
  return `\n\nCONTEXTO OPERACIONAL:\n- ${parts.join("\n- ")}\nInclua estes dados no relatório e nas recomendações.`;
}

export const emptyEquipArea: EquipArea = { equipamento: "", area: "" };
