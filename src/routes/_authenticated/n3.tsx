import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { RecordModule } from "@/components/record-module";
import { SafetyPlanLauncher } from "@/components/safety-plan/launcher";

export const Route = createFileRoute("/_authenticated/n3")({
  head: () => ({
    meta: [
      { title: "N3 - Não Conformidade · VALETECH" },
      {
        name: "description",
        content:
          "Registro inteligente, análise e tratativa de não conformidades com apoio da IA.",
      },
    ],
  }),
  component: () => (
    <>
      <div className="mb-4 flex justify-end px-4 pt-4">
        <SafetyPlanLauncher moduleKey="n3" title="N3" label="Projeto Executivo" />
      </div>
      <RecordModule
        moduleKey="n3"
        icon={ShieldAlert}
        title="N3 - Não Conformidade"
        subtitle="Registro inteligente, análise e tratativa de não conformidades com apoio da IA."
        createLabel="Analisar"
      />
    </>
  ),
});
