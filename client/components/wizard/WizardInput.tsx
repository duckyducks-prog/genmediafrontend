import { Textarea } from "@/components/ui/textarea";
import type { CompoundInput } from "@/lib/compound-nodes/types";
import ImageUploader from "./ImageUploader";
import VideoUploader from "./VideoUploader";

interface WizardInputProps {
  input: CompoundInput;
  value: any;
  onChange: (value: any) => void;
  disabled: boolean;
}

export default function WizardInput({
  input,
  value,
  onChange,
  disabled,
}: WizardInputProps) {
  return (
    <div className="wizard-field">
      <label className="wizard-field-label">{input.name}</label>

      {input.type === "text" && (
        <Textarea
          className="wizard-textarea"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${input.name.toLowerCase()}...`}
          disabled={disabled}
          rows={4}
        />
      )}

      {input.type === "image" && (
        <ImageUploader value={value} onChange={onChange} disabled={disabled} />
      )}

      {input.type === "video" && (
        <VideoUploader value={value} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}
