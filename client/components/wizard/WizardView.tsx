import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, X } from "lucide-react";
import "./wizard.css";
import { Button } from "@/components/ui/button";
import { getCompoundTemplate } from "@/lib/compound-nodes/storage";
import { executeCompoundNode } from "@/lib/compound-nodes/executeCompound";
import { useWorkflowExecution } from "@/components/workflow/useWorkflowExecution";
import type { WorkflowNode, WorkflowEdge } from "@/components/workflow/types";
import WizardInput from "./WizardInput";
import WizardControl from "./WizardControl";
import WizardResults from "./WizardResults";

interface WizardViewProps {
  wizardId: string;
}

export default function WizardView({ wizardId }: WizardViewProps) {
  const navigate = useNavigate();
  const wizard = getCompoundTemplate(wizardId);

  // Create temporary nodes/edges state for execution
  const [tempNodes, setTempNodes] = useState<WorkflowNode[]>([]);
  const [tempEdges, setTempEdges] = useState<WorkflowEdge[]>([]);

  // Get execution function from hook
  const { executeWorkflow: executeWorkflowHook } = useWorkflowExecution(
    tempNodes,
    tempEdges,
    setTempNodes,
    setTempEdges,
  );

  // Form state
  const [inputValues, setInputValues] = useState<Record<string, any>>({});
  const [controlValues, setControlValues] = useState<Record<string, any>>({});

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize control values with defaults
  useEffect(() => {
    if (wizard) {
      const defaults: Record<string, any> = {};
      wizard.controls.forEach((control) => {
        defaults[control.id] = control.default;
      });
      setControlValues(defaults);
    }
  }, [wizard]);

  if (!wizard) {
    return (
      <div className="wizard-view">
        <div className="wizard-not-found">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Wizard not found</h2>
          <p className="text-muted-foreground mb-4">
            This wizard may have been deleted or doesn't exist.
          </p>
          <Button onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const handleInputChange = (inputId: string, value: any) => {
    setInputValues((prev) => ({ ...prev, [inputId]: value }));
  };

  const handleControlChange = (controlId: string, value: any) => {
    setControlValues((prev) => ({ ...prev, [controlId]: value }));
  };

  const handleGenerate = async () => {
    setIsRunning(true);
    setProgress("Starting...");
    setResults(null);
    setError(null);

    try {
      // Create a mock node structure for execution
      const mockNode = {
        id: "wizard-execution",
        type: "compound" as const,
        position: { x: 0, y: 0 },
        data: {
          ...wizard,
          controlValues,
        },
      };

      const result = await executeCompoundNode(
        mockNode,
        inputValues,
        executeWorkflow,
      );

      if (result.success) {
        setResults(result.data);
        setProgress(null);
      } else {
        setError(result.error || "Generation failed");
      }
    } catch (err) {
      console.error("[WizardView] Execution error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const canGenerate = wizard.inputs.every((input) => {
    const value = inputValues[input.id];
    return value !== undefined && value !== "";
  });

  return (
    <div className="wizard-view">
      {/* Back button */}
      <button className="back-button" onClick={() => navigate("/")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </button>

      {/* Header */}
      <div className="wizard-header">
        <span className="wizard-icon">{wizard.icon}</span>
        <h1 className="wizard-title">{wizard.name}</h1>
        {wizard.description && (
          <p className="wizard-description">{wizard.description}</p>
        )}
      </div>

      {/* Form */}
      <div className="wizard-form">
        {/* Inputs */}
        {wizard.inputs.length > 0 && (
          <div className="wizard-inputs">
            {wizard.inputs.map((input) => (
              <WizardInput
                key={input.id}
                input={input}
                value={inputValues[input.id]}
                onChange={(value) => handleInputChange(input.id, value)}
                disabled={isRunning}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        {wizard.controls.length > 0 && (
          <div className="wizard-controls">
            {wizard.controls.map((control) => (
              <WizardControl
                key={control.id}
                control={control}
                value={controlValues[control.id]}
                onChange={(value) => handleControlChange(control.id, value)}
                disabled={isRunning}
              />
            ))}
          </div>
        )}

        {/* Generate Button */}
        <Button
          className="wizard-generate-btn"
          onClick={handleGenerate}
          disabled={isRunning || !canGenerate}
          size="lg"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {progress || "Generating..."}
            </>
          ) : (
            <>✨ Generate</>
          )}
        </Button>

        {/* Error */}
        {error && (
          <div className="wizard-error">
            <AlertCircle className="w-4 h-4" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {results && <WizardResults outputs={wizard.outputs} results={results} />}
    </div>
  );
}
