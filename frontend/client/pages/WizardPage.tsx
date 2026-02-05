import { } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import WizardView from "@/components/wizard/WizardView";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { logOut } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  Home,
  Image as ImageIcon,
  Video as VideoIcon,
  Workflow as WorkflowIcon,
  FolderOpen,
  LogOut,
} from "lucide-react";

export default function WizardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

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

  // Navigation helper
  const NavLink = ({ icon, label, path }: { icon: React.ReactNode; label: string; path: string }) => (
    <button
      onClick={() => navigate(path)}
      className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors text-muted-foreground hover:bg-secondary"
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <WorkflowProvider>
      <div className="min-h-screen bg-[#360F46] flex flex-col">
        {/* Main App Header */}
        <header className="border-b border-border">
          <div className="py-8 border-b border-border">
            <div className="px-4 flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <img
                  src="https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2F30fc0e70b75040f4858161ac143ab00c?format=webp&width=800"
                  alt="Sprocket"
                  className="w-10 h-10"
                />
                <h1 className="text-4xl font-bold" style={{ color: "#F8F5EE" }}>
                  HubSpot Gen Media Studio
                </h1>
              </div>

              {/* User Info & Sign Out */}
              {user && (
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {user.email}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await logOut();
                        toast({
                          title: "Signed out",
                          description: "You have been signed out successfully",
                        });
                        navigate("/");
                      } catch (error) {
                        toast({
                          title: "Sign out failed",
                          description:
                            error instanceof Error
                              ? error.message
                              : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Icons */}
          <nav className="px-4 py-4 flex gap-2 items-center justify-start overflow-x-auto border-b border-border">
            <NavLink icon={<Home className="w-5 h-5" />} label="Home" path="/" />
            <NavLink icon={<ImageIcon className="w-5 h-5" />} label="Image" path="/" />
            <NavLink icon={<VideoIcon className="w-5 h-5" />} label="Video" path="/" />
            <NavLink icon={<WorkflowIcon className="w-5 h-5" />} label="Workflow" path="/" />
            <button
              onClick={() => navigate("/")}
              className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors text-muted-foreground hover:bg-secondary"
              title="Library"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
          </nav>
        </header>

        {/* Wizard Content */}
        <div className="flex-1">
          <WizardView wizardId={id} />
        </div>
      </div>
    </WorkflowProvider>
  );
}
