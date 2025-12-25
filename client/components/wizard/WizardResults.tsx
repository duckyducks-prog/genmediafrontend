import { Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompoundOutput } from "@/lib/compound-nodes/types";

interface WizardResultsProps {
  outputs: CompoundOutput[];
  results: Record<string, any>;
}

interface ResultItemProps {
  label: string;
  type: string;
  value: any;
}

function ResultItem({ label, type, value }: ResultItemProps) {
  if (!value) {
    return (
      <div className="result-item empty">
        <div className="result-placeholder">No result</div>
        <div className="result-label">{label}</div>
      </div>
    );
  }

  return (
    <div className="result-item">
      {type === "video" && (
        <video className="result-video" src={value} controls />
      )}

      {type === "image" && (
        <img className="result-image" src={value} alt={label} />
      )}

      {type === "text" && <div className="result-text">{value}</div>}

      <div className="result-label">{label}</div>
    </div>
  );
}

export default function WizardResults({
  outputs,
  results,
}: WizardResultsProps) {
  const handleDownloadAll = () => {
    outputs.forEach((output) => {
      const value = results[output.id];
      if (value) {
        const link = document.createElement("a");
        link.href = value;
        link.download = `${output.name.replace(/\s+/g, "-").toLowerCase()}`;
        link.click();
      }
    });
  };

  const handleSaveToLibrary = () => {
    // TODO: Implement save to library functionality
    console.log("Save to library not yet implemented");
  };

  return (
    <div className="wizard-results">
      <h2 className="wizard-results-title">Results</h2>

      <div className="wizard-results-grid">
        {outputs.map((output) => {
          const value = results[output.id];

          // Handle array outputs (video[], image[])
          if (Array.isArray(value)) {
            return value.map((item, index) => (
              <ResultItem
                key={`${output.id}-${index}`}
                label={`${output.name} ${index + 1}`}
                type={output.type.replace("[]", "")}
                value={item}
              />
            ));
          }

          return (
            <ResultItem
              key={output.id}
              label={output.name}
              type={output.type}
              value={value}
            />
          );
        })}
      </div>

      <div className="wizard-results-actions">
        <Button
          className="wizard-action-btn secondary"
          onClick={handleDownloadAll}
          variant="outline"
        >
          <Download className="w-4 h-4 mr-2" />
          Download All
        </Button>
        <Button
          className="wizard-action-btn primary"
          onClick={handleSaveToLibrary}
        >
          <Save className="w-4 h-4 mr-2" />
          Save to Library
        </Button>
      </div>
    </div>
  );
}
