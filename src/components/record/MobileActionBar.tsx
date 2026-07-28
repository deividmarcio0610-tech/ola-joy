import { Button } from "@/components/ui/button";

export function MobileActionBar({
  onCancel,
  onDraft,
  onSave,
  saveLabel = "Salvar registro",
  disabled,
  saving,
}: {
  onCancel: () => void;
  onDraft: () => void;
  onSave: () => void;
  saveLabel?: string;
  disabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t bg-background/95 p-3 backdrop-blur sm:mx-0 sm:mb-0 sm:rounded-b-lg">
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={disabled}
        className="flex-1 sm:flex-none"
      >
        Cancelar
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDraft}
        disabled={disabled || saving}
        className="flex-1 sm:flex-none"
      >
        Salvar rascunho
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={disabled || saving}
        className="flex-[2] sm:flex-none"
      >
        {saving ? "Salvando…" : saveLabel}
      </Button>
    </div>
  );
}
