import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { RecordModule } from "@/components/record-module";

export const Route = createFileRoute("/_authenticated/supervisao")({
  head: () => ({ meta: [{ title: "Supervisão · VisionGuard AI" }] }),
  component: () => (
    <RecordModule
      moduleKey="supervision"
      icon={Eye}
      title="Supervisão"
      subtitle="Rondas, apontamentos e tratativas do supervisor."
      createLabel="Novo apontamento"
    />
  ),
});
