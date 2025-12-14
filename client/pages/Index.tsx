import { useState, useRef } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Download,
  Loader2,
  Image as ImageIcon,
  Video as VideoIcon,
  Upload,
  X,
  Home,
  Workflow as WorkflowIcon,
  FolderOpen,
  LogOut,
} from "lucide-react";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";
import AssetLibrary, {
  AssetLibraryRef,
} from "@/components/library/AssetLibrary";
import { useAuth } from "@/lib/AuthContext";
import { logOut, auth } from "@/lib/firebase";
import { saveToLibrary } from "@/lib/api-helpers";
import Login from "./Login";
import { useToast } from "@/hooks/use-toast";

export default function Index() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const assetLibraryRef = useRef<AssetLibraryRef>(null);
  const [currentTab, setCurrentTab] = useState("image");
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const handleReferenceImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFirstFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFirstFrame(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLastFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLastFrame(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;

    setIsGeneratingImage(true);
    try {
      const currentUser = auth.currentUser;
      const token = await currentUser?.getIdToken();

      const response = await fetch(
        "https://veo-api-82187245577.us-central1.run.app/generate/image",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: imagePrompt,
          }),
        },
      );

      if (response.status === 403) {
        toast({
          title: "Access Denied",
          description: "Access denied. Contact administrator.",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      if (data.images && data.images[0]) {
        const dataUri = `data:image/png;base64,${data.images[0]}`;
        setImageResult(dataUri);

        // Save to library
        try {
          await saveToLibrary({
            imageUrl: dataUri,
            prompt: imagePrompt,
            assetType: 'image'
          });

          console.log("[Index] Image saved to library successfully");

          // Refresh library to show the newly saved image
          if (assetLibraryRef.current) {
            assetLibraryRef.current.refresh();
          }
        } catch (error) {
          console.error("[Index] Failed to save image to library:", error);
          toast({
            title: "Warning",
            description: "Image generated but failed to save to library",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error generating image:", error);
      toast({
        title: "Error",
        description: "Failed to generate image",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;

    setIsGeneratingVideo(true);
    try {
      const currentUser = auth.currentUser;
      const token = await currentUser?.getIdToken();

      const response = await fetch(
        "https://veo-api-82187245577.us-central1.run.app/generate/video",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: videoPrompt,
          }),
        },
      );

      if (response.status === 403) {
        toast({
          title: "Access Denied",
          description: "Access denied. Contact administrator.",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      const operationName = data.operation_name;

      let complete = false;
      while (!complete) {
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const statusToken = await currentUser?.getIdToken();
        const statusResponse = await fetch(
          "https://veo-api-82187245577.us-central1.run.app/video/status",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${statusToken}`
            },
            body: JSON.stringify({ operation_name: operationName }),
          },
        );
        const statusData = await statusResponse.json();

        if (statusData.status === "complete") {
          complete = true;
          if (statusData.video_base64) {
            const dataUri = `data:video/mp4;base64,${statusData.video_base64}`;
            setVideoResult(dataUri);

            // Save to library
            try {
              await saveToLibrary({
                imageUrl: dataUri,
                prompt: videoPrompt,
                assetType: 'video'
              });

              console.log("[Index] Video saved to library successfully");

              // Refresh library to show the newly saved video
              if (assetLibraryRef.current) {
                assetLibraryRef.current.refresh();
              }
            } catch (error) {
              console.error("[Index] Failed to save video to library:", error);
              toast({
                title: "Warning",
                description: "Video generated but failed to save to library",
                variant: "destructive",
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Error generating video:", error);
      toast({
        title: "Error",
        description: "Failed to generate video",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleDownloadImage = () => {
    if (!imageResult) return;
    const link = document.createElement("a");
    link.href = imageResult;
    link.download = `ai-image-${Date.now()}.jpg`;
    link.click();
  };

  const handleDownloadVideo = () => {
    if (!videoResult) return;
    const link = document.createElement("a");
    link.href = videoResult;
    link.download = `ai-video-${Date.now()}.mp4`;
    link.click();
  };

  const NavLink = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => (
    <button
      onClick={() => setCurrentTab(value)}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
        currentTab === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary"
      }`}
      title={label}
    >
      {Icon}
    </button>
  );

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <Login />;
  }

  // Show main app if authenticated
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex flex-col">
      <header className="border-b border-border">
        <div className="px-4 py-8 border-b border-border">
          <div className="container mx-auto flex items-center justify-between">
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

        <nav className="px-4 py-4 flex gap-2 items-center justify-start overflow-x-auto border-b border-border">
          <NavLink
            icon={<Home className="w-5 h-5" />}
            label="Home"
            value="home"
          />
          <NavLink
            icon={<ImageIcon className="w-5 h-5" />}
            label="Image"
            value="image"
          />
          <NavLink
            icon={<VideoIcon className="w-5 h-5" />}
            label="Video"
            value="video"
          />
          <NavLink
            icon={<WorkflowIcon className="w-5 h-5" />}
            label="Workflow"
            value="workflow"
          />
          <button
            onClick={() => setIsLibraryOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors text-muted-foreground hover:bg-secondary"
            title="Library"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
        </nav>
      </header>

      <div className="flex flex-1 gap-0">
        <div
          className={`flex-1 container mx-auto px-4 py-8 ${currentTab === "workflow" ? "max-w-none px-0" : "max-w-4xl"}`}
        >
          <Tabs value={currentTab} className="w-full">
            <TabsContent value="image" className="space-y-6">
              <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
                <div>
                  <label
                    htmlFor="image-prompt"
                    className="block text-sm font-medium mb-2"
                  >
                    Describe your image
                  </label>
                  <Textarea
                    id="image-prompt"
                    placeholder="A serene mountain landscape at sunset with vibrant colors..."
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reference-image"
                    className="block text-sm font-medium mb-2"
                  >
                    Reference Image (Optional)
                  </label>
                  {referenceImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                      <img
                        src={referenceImage}
                        alt="Reference"
                        className="w-full h-48 object-cover"
                      />
                      <Button
                        onClick={() => setReferenceImage(null)}
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="reference-image"
                      className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center py-6">
                        <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload reference image
                        </p>
                      </div>
                      <input
                        id="reference-image"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleReferenceImageUpload}
                      />
                    </label>
                  )}
                </div>

                <Button
                  onClick={handleGenerateImage}
                  disabled={!imagePrompt.trim() || isGeneratingImage}
                  className="w-full"
                  size="lg"
                >
                  {isGeneratingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Image
                    </>
                  )}
                </Button>
              </div>

              {imageResult && (
                <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Generated Image</h3>
                    <Button
                      onClick={handleDownloadImage}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                  <div className="relative rounded-lg overflow-hidden bg-muted">
                    <img
                      src={imageResult}
                      alt="Generated"
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="video" className="space-y-6">
              <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
                <div>
                  <label
                    htmlFor="video-prompt"
                    className="block text-sm font-medium mb-2"
                  >
                    Describe your video
                  </label>
                  <Textarea
                    id="video-prompt"
                    placeholder="A time-lapse of a bustling city transitioning from day to night..."
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="first-frame"
                    className="block text-sm font-medium mb-2"
                  >
                    First Frame (Optional)
                  </label>
                  {firstFrame ? (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                      <img
                        src={firstFrame}
                        alt="First Frame"
                        className="w-full h-48 object-cover"
                      />
                      <Button
                        onClick={() => setFirstFrame(null)}
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="first-frame"
                      className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center py-6">
                        <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload first frame
                        </p>
                      </div>
                      <input
                        id="first-frame"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFirstFrameUpload}
                      />
                    </label>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="last-frame"
                    className="block text-sm font-medium mb-2"
                  >
                    Last Frame (Optional)
                  </label>
                  {lastFrame ? (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                      <img
                        src={lastFrame}
                        alt="Last Frame"
                        className="w-full h-48 object-cover"
                      />
                      <Button
                        onClick={() => setLastFrame(null)}
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="last-frame"
                      className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center py-6">
                        <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload last frame
                        </p>
                      </div>
                      <input
                        id="last-frame"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleLastFrameUpload}
                      />
                    </label>
                  )}
                </div>

                <Button
                  onClick={handleGenerateVideo}
                  disabled={!videoPrompt.trim() || isGeneratingVideo}
                  className="w-full"
                  size="lg"
                >
                  {isGeneratingVideo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Video
                    </>
                  )}
                </Button>
              </div>

              {videoResult && (
                <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Generated Video</h3>
                    <Button
                      onClick={handleDownloadVideo}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                  <div className="relative rounded-lg overflow-hidden bg-muted">
                    <video
                      src={videoResult}
                      controls
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="workflow" className="h-[calc(100vh-200px)]">
              <WorkflowCanvas
                onAssetGenerated={() => {
                  console.log("[Index] Asset generated callback triggered");
                  console.log(
                    "[Index] AssetLibrary ref:",
                    assetLibraryRef.current,
                  );
                  if (assetLibraryRef.current) {
                    console.log("[Index] Calling refresh on asset library");
                    assetLibraryRef.current.refresh();
                  } else {
                    console.warn(
                      "[Index] AssetLibrary ref is null, cannot refresh",
                    );
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Asset Library */}
      <AssetLibrary
        ref={assetLibraryRef}
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
      />
    </div>
  );
}
