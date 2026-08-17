import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { RecordModule } from "@/components/record-module";
import { SafetyPlanLauncher } from "@/components/safety-plan/launcher";

function InspecaoPage() {
  return (
    <>
      <div className="mb-4 flex justify-end gap-2 px-4 pt-4">
        <SafetyPlanLauncher moduleKey="inspection" title="Inspeção 5S" label="Projeto Executivo" />
      </div>
      <RecordModule
        moduleKey="inspection"
        icon={ClipboardCheck}
        title="Inspeção 5S"
        subtitle="Inspeção 5S com registro inteligente, análise IA e correção real via foto Depois."
        createLabel="Analisar"
      />
    </>
  );
}

export const Route = createFileRoute("/_authenticated/inspecao")({
  head: () => ({
    meta: [
      { title: "Inspeção 5S · VisionGuard AI" },
      {
        name: "description",
        content: "Inspeção 5S com análise automática pela IA e comparação Antes/Depois.",
      },
    ],
  }),
  component: InspecaoPage,
});
