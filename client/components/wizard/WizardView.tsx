import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, X } from "lucide-react";
import "./wizard.css";
import { Button } from "@/components/ui/button";
import { getCompoundTemplate } from "@/lib/compound-nodes/storage";
import { useWorkflowExecution } from "@/components/workflow/useWorkflowExecution";
import type { WorkflowNode, WorkflowEdge, NodeType } from "@/components/workflow/types";
import WizardInput from "./WizardInput";
import WizardControl from "./WizardControl";
import WizardResults from "./WizardResults";

interface WizardViewProps {
  wizardId: string;
}

// Helper to get nested values from objects
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, key) => curr?.[key], obj);
}

// Helper to set nested values in objects
function setNestedValue(obj: any, path: string, value: any) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

export default function WizardView({ wizardId }: WizardViewProps) {
  const navigate = useNavigate();
  const wizard = getCompoundTemplate(wizardId);

  console.log("[WizardView] Rendering with wizardId:", wizardId);
  console.log("[WizardView] Wizard data:", wizard);

  // State for internal workflow execution
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([]);
  
  // Get workflow execution hook
  const { executeWorkflow, isExecuting } = useWorkflowExecution(
    workflowNodes,
    workflowEdges,
    setWorkflowNodes,
    setWorkflowEdges,
  );

  // Form state
  const [inputValues, setInputValues] = useState<Record<string, any>>({});
  const [controlValues, setControlValues] = useState<Record<string, any>>({});

  // Execution state
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasExecuting, setWasExecuting] = useState(false);

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

  // Collect results after execution completes
  useEffect(() => {
    // Check if execution just finished
    if (wasExecuting && !isExecuting && workflowNodes.length > 0) {
      console.log("[WizardView] Execution completed, collecting results...");

      // ========================================================================
      // Collect outputs using wizard.outputs definitions and wizard.mappings.outputs
      // This ensures we only collect the outputs that were auto-generated during
      // wizard creation (GenerateImage/GenerateVideo nodes) and nothing else
      // ========================================================================
      const allOutputs: Record<string, any> = {};

      // Use wizard.outputs to know what outputs to collect
      wizard.outputs.forEach((outputDef) => {
        const mapping = wizard.mappings.outputs[outputDef.id];

        if (mapping) {
          // Find the node referenced by this output mapping
          const node = workflowNodes.find((n) => n.id === mapping.nodeId);

          if (node) {
            // Extract the value from the node using the mapping path
            const value = getNestedValue(node, mapping.param);

            if (value) {
              allOutputs[outputDef.id] = value;
              console.log(`[WizardView] Collected "${outputDef.name}" (${outputDef.type}) from ${mapping.nodeId}`);
            } else {
              console.warn(`[WizardView] No value found at ${mapping.nodeId}.${mapping.param}`);
            }
          } else {
            console.warn(`[WizardView] Node ${mapping.nodeId} not found in workflow`);
          }
        }
      });

      console.log("[WizardView] All outputs collected:", {
        expected: wizard.outputs.length,
        collected: Object.keys(allOutputs).length,
        outputs: wizard.outputs.map(o => o.name),
      });

      if (Object.keys(allOutputs).length > 0) {
        setResults(allOutputs);
        setError(null);
      } else {
        setError("No outputs were generated. Please check your inputs and try again.");
      }
    }

    // Track execution state
    if (isExecuting) {
      setWasExecuting(true);
    } else if (wasExecuting) {
      setWasExecuting(false);
    }
  }, [isExecuting, workflowNodes, wasExecuting, wizard]);

  if (!wizard) {
    return (
      <div className="wizard-view">
        <div className="wizard-not-found">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Wizard not found</h2>
          <p className="text-muted-foreground mb-4">
            This wizard may have been deleted or doesn't exist.
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Wizard ID: {wizardId}
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
    setResults(null);
    setError(null);

    try {
      console.log("[WizardView] Starting execution...");

      // ========================================================================
      // STEP 1: Clone the ENTIRE internal workflow
      // The full workflow always runs - exposed inputs/controls just determine
      // what the user can see/control in the wizard UI
      // ========================================================================
      const nodes: WorkflowNode[] = JSON.parse(
        JSON.stringify(wizard.internalWorkflow.nodes),
      );
      const edges: WorkflowEdge[] = JSON.parse(
        JSON.stringify(wizard.internalWorkflow.edges),
      );

      // ========================================================================
      // STEP 2: Inject values for EXPOSED inputs (user-provided values)
      // Non-exposed nodes keep their default values from the original workflow
      // ========================================================================
      if (wizard.mappings.inputs) {
        for (const [exposedId, mapping] of Object.entries(
          wizard.mappings.inputs,
        )) {
          const inputValue = inputValues[exposedId];
          if (inputValue !== undefined) {
            const node = nodes.find((n) => n.id === (mapping as any).nodeId);
            if (node) {
              setNestedValue(node, (mapping as any).param, inputValue);
              console.log(
                `[WizardView] Injected input "${exposedId}" -> ${(mapping as any).nodeId}.${(mapping as any).param}`,
              );
            }
          }
        }
      }

      // ========================================================================
      // STEP 3: Apply values for EXPOSED controls (user-adjusted values)
      // Non-exposed parameters keep their default values from the original workflow
      // ========================================================================
      if (wizard.mappings.controls) {
        for (const [controlId, mappingList] of Object.entries(
          wizard.mappings.controls,
        )) {
          const value = controlValues[controlId];
          if (value !== undefined && Array.isArray(mappingList)) {
            for (const mapping of mappingList) {
              const node = nodes.find((n) => n.id === (mapping as any).nodeId);
              if (node) {
                setNestedValue(node, (mapping as any).param, value);
                console.log(
                  `[WizardView] Applied control "${controlId}" (${value}) -> ${(mapping as any).nodeId}.${(mapping as any).param}`,
                );
              }
            }
          }
        }
      }

      // ========================================================================
      // STEP 4: Execute the FULL workflow
      // Every node runs, not just the exposed ones
      // ========================================================================
      setWorkflowNodes(nodes);
      setWorkflowEdges(edges);

      // Execute and wait for completion (results collected by useEffect)
      await executeWorkflow();

    } catch (err) {
      console.error("[WizardView] Execution error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
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
                disabled={isExecuting}
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
                disabled={isExecuting}
              />
            ))}
          </div>
        )}

        {/* Generate Button */}
        <Button
          className="wizard-generate-btn"
          onClick={handleGenerate}
          disabled={isExecuting || !canGenerate}
          size="lg"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
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
      {results && (
        <div className="wizard-results">
          <h2 className="wizard-results-title">Results</h2>

          <div className="wizard-results-grid">
            {Object.entries(results).map(([key, value]) => {
              const isVideo = key.includes("video");
              const isImage = key.includes("image");

              return (
                <div key={key} className="result-item">
                  {isVideo && value && (
                    <video className="result-video" src={value as string} controls />
                  )}

                  {isImage && value && (
                    <img className="result-image" src={value as string} alt="Generated" />
                  )}

                  {!isVideo && !isImage && (
                    <div className="result-text">{String(value)}</div>
                  )}

                  <div className="result-label">{key.split("_").slice(1).join(" ")}</div>
                </div>
              );
            })}
          </div>

          <div className="wizard-results-actions">
            <Button
              className="wizard-action-btn secondary"
              onClick={() => {
                // Download all results
                Object.entries(results).forEach(([key, value]) => {
                  if (value) {
                    const link = document.createElement("a");
                    link.href = value as string;
                    link.download = `${key}`;
                    link.click();
                  }
                });
              }}
              variant="outline"
            >
              ⬇️ Download All
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
