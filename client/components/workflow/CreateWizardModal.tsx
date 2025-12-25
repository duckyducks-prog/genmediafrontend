import React, { useState, useMemo } from "react";
import { Node, Edge } from "reactflow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { analyzeWorkflow } from "@/lib/compound-nodes/analyzeWorkflow";
import {
  buildCompoundDefinition,
  validateCompoundDefinition,
} from "@/lib/compound-nodes/buildCompoundDefinition";
import { saveCompoundTemplate } from "@/lib/compound-nodes/storage";
import { CompoundNodeDefinition } from "@/lib/compound-nodes/types";
import { ConnectorType } from "./types";
import { Badge } from "@/components/ui/badge";

interface CreateWizardModalProps {
  nodes: Node[];
  edges: Edge[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (compound: CompoundNodeDefinition) => void;
}

const ICON_OPTIONS = [
  "🧙",
  "🎬",
  "🖼️",
  "✨",
  "🚀",
  "🎨",
  "📝",
  "🔄",
  "⚡",
  "🎯",
  "🎭",
  "📊",
  "🔧",
  "💡",
  "🌟",
];

export default function CreateWizardModal({
  nodes,
  edges,
  open,
  onOpenChange,
  onSave,
}: CreateWizardModalProps) {
  // Basic info state
  const [name, setName] = useState("My Wizard");
  const [icon, setIcon] = useState("🧙");
  const [description, setDescription] = useState("");

  // Selection state (track which items are selected and their custom names)
  const [selectedInputs, setSelectedInputs] = useState<
    Record<
      string,
      {
        id: string;
        nodeId: string;
        inputHandle: string;
        exposedName: string;
        type: ConnectorType | "text" | "image" | "video";
        paramPath?: string; // For Input nodes
      }
    >
  >({});

  const [selectedControls, setSelectedControls] = useState<
    Record<
      string,
      {
        id: string;
        nodeId: string;
        paramPath: string;
        exposedName: string;
        controlType: "slider" | "dropdown" | "text" | "toggle";
        config: any;
      }
    >
  >({});

  const [selectedOutputs, setSelectedOutputs] = useState<
    Record<
      string,
      {
        id: string;
        nodeId: string;
        outputHandle: string;
        exposedName: string;
        type: ConnectorType;
      }
    >
  >({});

  // Analyze workflow to get available items
  const analysis = useMemo(() => analyzeWorkflow(nodes, edges), [nodes, edges]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setName("My Wizard");
      setIcon("🧙");
      setDescription("");
      setSelectedInputs({});
      setSelectedControls({});
      setSelectedOutputs({});
    }
  }, [open]);

  // Handlers for toggling selections
  const handleInputToggle = (
    inputId: string,
    checked: boolean,
    input: (typeof analysis.availableInputs)[0],
  ) => {
    if (checked) {
      setSelectedInputs((prev) => ({
        ...prev,
        [inputId]: {
          id: inputId,
          nodeId: input.nodeId,
          inputHandle: input.inputHandle,
          exposedName: input.suggestedName,
          type: input.type,
          paramPath: input.paramPath, // Store paramPath for Input nodes
        },
      }));
    } else {
      setSelectedInputs((prev) => {
        const next = { ...prev };
        delete next[inputId];
        return next;
      });
    }
  };

  const handleControlToggle = (
    controlId: string,
    checked: boolean,
    control: (typeof analysis.availableControls)[0],
  ) => {
    if (checked) {
      setSelectedControls((prev) => ({
        ...prev,
        [controlId]: {
          id: controlId,
          nodeId: control.nodeId,
          paramPath: control.paramPath,
          exposedName: control.suggestedName,
          controlType: control.suggestedControlType,
          config: control.config,
        },
      }));
    } else {
      setSelectedControls((prev) => {
        const next = { ...prev };
        delete next[controlId];
        return next;
      });
    }
  };

  const handleOutputToggle = (
    outputId: string,
    checked: boolean,
    output: (typeof analysis.availableOutputs)[0],
  ) => {
    if (checked) {
      setSelectedOutputs((prev) => ({
        ...prev,
        [outputId]: {
          id: outputId,
          nodeId: output.nodeId,
          outputHandle: output.outputHandle,
          exposedName: output.suggestedName,
          type: output.type,
        },
      }));
    } else {
      setSelectedOutputs((prev) => {
        const next = { ...prev };
        delete next[outputId];
        return next;
      });
    }
  };

  // Update exposed name for an item
  const updateInputName = (id: string, newName: string) => {
    setSelectedInputs((prev) => ({
      ...prev,
      [id]: { ...prev[id], exposedName: newName },
    }));
  };

  const updateControlName = (id: string, newName: string) => {
    setSelectedControls((prev) => ({
      ...prev,
      [id]: { ...prev[id], exposedName: newName },
    }));
  };

  const updateOutputName = (id: string, newName: string) => {
    setSelectedOutputs((prev) => ({
      ...prev,
      [id]: { ...prev[id], exposedName: newName },
    }));
  };

  const updateControlType = (
    id: string,
    newType: "slider" | "dropdown" | "text" | "toggle",
  ) => {
    setSelectedControls((prev) => ({
      ...prev,
      [id]: { ...prev[id], controlType: newType },
    }));
  };

  // Save handler
  const handleSave = () => {
    const inputData = {
      name,
      icon,
      description,
      nodes,
      edges,
      exposedInputs: selectedInputs,
      exposedControls: selectedControls,
      exposedOutputs: selectedOutputs,
    };

    // Validate
    const error = validateCompoundDefinition(inputData);
    if (error) {
      toast({
        title: "Validation Error",
        description: error,
        variant: "destructive",
      });
      return;
    }

    try {
      // Build and save
      const compound = buildCompoundDefinition(inputData);
      saveCompoundTemplate(compound);

      // Dispatch event to notify UI to reload wizards
      window.dispatchEvent(new Event("wizard-saved"));

      toast({
        title: "Wizard Created",
        description: `"${compound.name}" is now available on the home page.`,
      });

      // Call onSave callback if provided
      onSave?.(compound);

      // Close modal
      onOpenChange(false);
    } catch (error) {
      console.error("[CreateWizardModal] Failed to save:", error);
      toast({
        title: "Save Failed",
        description:
          error instanceof Error ? error.message : "Failed to save wizard",
        variant: "destructive",
      });
    }
  };

  const canSave =
    name.trim().length > 0 && Object.keys(selectedOutputs).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Wizard</DialogTitle>
          <DialogDescription>
            Save this workflow as a simple form that anyone can use
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info Section */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-name">Name</Label>
                <Input
                  id="wizard-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Wizard"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-icon">Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger id="wizard-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt} {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wizard-description">Description</Label>
              <Input
                id="wizard-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this wizard do?"
              />
            </div>
          </div>

          {/* Expose Inputs Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Expose as Inputs</h3>
              <p className="text-xs text-muted-foreground">
                Select which inputs become form fields
              </p>
            </div>

            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {analysis.availableInputs.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No available inputs
                </div>
              ) : (
                analysis.availableInputs.map((input) => (
                  <div
                    key={input.id}
                    className={`p-3 flex items-center gap-3 hover:bg-accent/50 ${
                      !input.isConnected ? "border-l-2 border-l-blue-500" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedInputs[input.id]}
                      onChange={(e) =>
                        handleInputToggle(input.id, e.target.checked, input)
                      }
                      className="w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {input.nodeName}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-sm font-medium">
                          {input.inputName}
                        </span>
                        {!input.isConnected && (
                          <Badge variant="secondary" className="text-xs">
                            unconnected
                          </Badge>
                        )}
                      </div>
                    </div>
                    {selectedInputs[input.id] && (
                      <Input
                        value={selectedInputs[input.id].exposedName}
                        onChange={(e) => updateInputName(input.id, e.target.value)}
                        placeholder="Display name"
                        className="w-40 h-8 text-xs"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Expose Controls Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Expose as Controls</h3>
              <p className="text-xs text-muted-foreground">
                Select parameters to expose as sliders/dropdowns in the form
              </p>
            </div>

            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {analysis.availableControls.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No available controls
                </div>
              ) : (
                analysis.availableControls.map((control) => (
                  <div
                    key={control.id}
                    className="p-3 flex items-center gap-3 hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedControls[control.id]}
                      onChange={(e) =>
                        handleControlToggle(control.id, e.target.checked, control)
                      }
                      className="w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {control.nodeName}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-sm font-medium">
                          {control.paramName}
                        </span>
                      </div>
                    </div>
                    {selectedControls[control.id] && (
                      <>
                        <Select
                          value={selectedControls[control.id].controlType}
                          onValueChange={(value: any) =>
                            updateControlType(control.id, value)
                          }
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="slider">Slider</SelectItem>
                            <SelectItem value="dropdown">Dropdown</SelectItem>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="toggle">Toggle</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={selectedControls[control.id].exposedName}
                          onChange={(e) =>
                            updateControlName(control.id, e.target.value)
                          }
                          placeholder="Display name"
                          className="w-32 h-8 text-xs"
                        />
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Create Wizard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
