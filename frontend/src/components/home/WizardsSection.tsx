import { useState, useEffect } from "react";
import { getCompoundTemplatesList } from "@/lib/compound-nodes/storage";
import WizardCard from "./WizardCard";
import "../wizard/wizard.css";

export default function WizardsSection() {
  const [wizards, setWizards] = useState(getCompoundTemplatesList());

  // Listen for wizard-saved event to refresh the list
  useEffect(() => {
    const handleWizardSaved = () => {
      setWizards(getCompoundTemplatesList());
    };

    window.addEventListener("wizard-saved", handleWizardSaved);
    window.addEventListener("storage", handleWizardSaved);

    return () => {
      window.removeEventListener("wizard-saved", handleWizardSaved);
      window.removeEventListener("storage", handleWizardSaved);
    };
  }, []);

  // Don't show section if no wizards
  if (wizards.length === 0) {
    return null;
  }

  return (
    <section className="wizards-section">
      <div className="section-header">
        <h2 className="text-2xl font-bold text-white">Wizards</h2>
        {wizards.length > 3 && (
          <button className="text-sm text-primary hover:underline">
            View All →
          </button>
        )}
      </div>

      <div className="wizards-grid">
        {wizards.slice(0, 6).map((wizard) => (
          <WizardCard key={wizard.id} wizard={wizard} />
        ))}
      </div>
    </section>
  );
}
