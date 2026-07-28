import { createFileRoute } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { RecordModule } from "@/components/record-module";
import { SafetyPlanLauncher } from "@/components/safety-plan/launcher";

function KaizenPage() {
  return (
    <>
      <div className="mb-4 flex justify-end gap-2 px-4 pt-4">
        <SafetyPlanLauncher moduleKey="kaizen" title="Kaizen" label="Projeto Executivo" />
      </div>
      <RecordModule
        moduleKey="kaizen"
        icon={Lightbulb}
        title="Kaizen"
        subtitle="Ciclo de melhoria contínua com mensuração de ganhos."
        showFinancial
        createLabel="Analisar"
      />
    </>
  );
}

export const Route = createFileRoute("/_authenticated/kaizen")({
  head: () => ({ meta: [{ title: "Kaizen · VALETECH" }] }),
  component: KaizenPage,
});
