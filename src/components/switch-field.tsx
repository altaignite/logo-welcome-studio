import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

/** Labelled on/off switch used for every yes/no setting. With a name it submits "on" inside forms, like a checkbox. */
export function SwitchField({ label, className, ...props }: {
  label: ReactNode; className?: string; name?: string; checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-center justify-between gap-3 text-sm ${className ?? ""}`}>
      <span className="min-w-0">{label}</span>
      <Switch id={id} {...props} />
    </label>
  );
}
