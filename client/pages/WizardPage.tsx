import { useParams } from "react-router-dom";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import WizardView from "@/components/wizard/WizardView";

export default function WizardPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="min-h-screen bg-[#360F46] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Wizard</h1>
          <p className="text-muted-foreground">No wizard ID provided</p>
        </div>
      </div>
    );
  }

  return (
    <WorkflowProvider>
      <div className="min-h-screen bg-[#360F46]">
        <WizardView wizardId={id} />
      </div>
    </WorkflowProvider>
  );
}
