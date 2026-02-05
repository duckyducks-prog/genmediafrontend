import { useNavigate } from "react-router-dom";
import type { CompoundNodeDefinition } from "@/lib/compound-nodes/types";

interface WizardCardProps {
  wizard: CompoundNodeDefinition;
}

export default function WizardCard({ wizard }: WizardCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="wizard-card group cursor-pointer"
      onClick={() => navigate(`/wizard/${wizard.id}`)}
    >
      <div className="wizard-card-icon">{wizard.icon}</div>
      <div className="wizard-card-name">{wizard.name}</div>
      {wizard.description && (
        <div className="wizard-card-description">{wizard.description}</div>
      )}
    </div>
  );
}
