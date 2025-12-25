import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}

export default function ImageUploader({
  value,
  onChange,
  disabled,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 data URI
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="wizard-uploader">
      {value ? (
        <div className="uploader-preview">
          <img src={value} alt="Preview" />
          <Button
            className="uploader-remove"
            onClick={() => onChange("")}
            disabled={disabled}
            variant="ghost"
            size="icon"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <div
          className="uploader-dropzone"
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <Upload className="uploader-icon" />
          <span className="uploader-text">Click to upload image</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={disabled}
        hidden
      />
    </div>
  );
}
