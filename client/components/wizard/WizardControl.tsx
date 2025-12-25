import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CompoundControl } from "@/lib/compound-nodes/types";

interface WizardControlProps {
  control: CompoundControl;
  value: any;
  onChange: (value: any) => void;
  disabled: boolean;
}

export default function WizardControl({
  control,
  value,
  onChange,
  disabled,
}: WizardControlProps) {
  const currentValue = value ?? control.default;

  return (
    <div className="wizard-field wizard-field-inline">
      <label className="wizard-field-label">{control.name}</label>

      {control.type === "dropdown" && (
        <Select
          value={currentValue?.toString()}
          onValueChange={(val) => onChange(val)}
          disabled={disabled}
        >
          <SelectTrigger className="wizard-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {control.options?.map((opt) => (
              <SelectItem key={opt} value={opt.toString()}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {control.type === "slider" && (
        <div className="wizard-slider-container">
          <input
            type="range"
            className="wizard-slider"
            min={control.min}
            max={control.max}
            step={control.step || 1}
            value={currentValue}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
          />
          <span className="wizard-slider-value">
            {currentValue}
            {control.id.includes("duration") ? "s" : ""}
          </span>
        </div>
      )}

      {control.type === "toggle" && (
        <input
          type="checkbox"
          className="wizard-toggle"
          checked={currentValue ?? false}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
      )}

      {control.type === "text" && (
        <Input
          type="text"
          className="wizard-text-input"
          value={currentValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}
