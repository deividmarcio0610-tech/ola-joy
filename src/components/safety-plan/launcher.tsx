import { useState } from "react";
import { HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SafetyPlanEditorDialog } from "./editor-dialog";

interface Props {
  moduleKey?: string | null;
  recordId?: string | null;
  photoUrl?: string;
  title?: string;
  label?: string;
  className?: string;
}

export function SafetyPlanLauncher({
  moduleKey,
  recordId,
  photoUrl,
  title,
  label,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary" className={className}>
        <HardHat className="mr-2 h-4 w-4" />
        {label ?? "Projeto Executivo"}
      </Button>
      <SafetyPlanEditorDialog
        open={open}
        onOpenChange={setOpen}
        photoUrl={photoUrl}
        recordId={recordId}
        moduleKey={moduleKey}
        title={title}
      />
    </>
  );
}
