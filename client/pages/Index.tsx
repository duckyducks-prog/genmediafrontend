import { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Download, Loader2, Image as ImageIcon, Video as VideoIcon, Upload, X, Home } from "lucide-react";

export default function Index() {
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

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const response = await fetch('https://veo-api-82187245577.us-central1.run.app/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      const data = await response.json();
      if (data.images && data.images[0]) {
        setImageResult(`data:image/png;base64,${data.images[0]}`);
      }
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;

    setIsGeneratingVideo(true);
    try {
      const response = await fetch('https://veo-api-82187245577.us-central1.run.app/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: videoPrompt }),
      });

      const data = await response.json();
      console.log('Video generation started:', data);
      alert('Video generation started! Operation: ' + data.operation_name);
    } catch (error) {
      console.error('Error generating video:', error);
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

  const NavLink = ({ icon: Icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <button
      onClick={() => setCurrentTab(value)}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors ${
        currentTab === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary"
      }`}
    >
      {Icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex flex-col">
      <header className="px-4 py-8 border-b border-border">
        <div className="container mx-auto">
          <div className="inline-flex items-center gap-2 mb-4">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2F30fc0e70b75040f4858161ac143ab00c?format=webp&width=800"
              alt="Sprocket"
              className="w-10 h-10"
            />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              HubSpot Gen Media Studio
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Generate stunning images and videos with AI
          </p>
        </div>
      </header>

      <div className="flex flex-1 gap-6">
        <aside className="w-48 border-r border-border px-4 py-8 hidden lg:flex flex-col gap-4">
          <NavLink icon={<Home className="w-4 h-4" />} label="Home" value="home" />
          <NavLink icon={<ImageIcon className="w-4 h-4" />} label="Image" value="image" />
          <NavLink icon={<VideoIcon className="w-4 h-4" />} label="Video" value="video" />
        </aside>

        <div className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          <Tabs value={currentTab} className="w-full">
            <TabsContent value="image" className="space-y-6">
              <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
                <div>
                  <label htmlFor="image-prompt" className="block text-sm font-medium mb-2">
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
                  <label htmlFor="reference-image" className="block text-sm font-medium mb-2">
                    Reference Image (Optional)
                  </label>
                  {referenceImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                      <img src={referenceImage} alt="Reference" className="w-full h-48 object-cover" />
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
                        <p className="text-sm text-muted-foreground">Click to upload reference image</p>
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
                  <label htmlFor="video-prompt" className="block text-sm font-medium mb-2">
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
                  <label htmlFor="first-frame" className="block text-sm font-medium mb-2">
                    First Frame (Optional)
                  </label>
                  {firstFrame ? (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                      <img src={firstFrame} alt="First Frame" className="w-full h-48 object-cover" />
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
                        <p className="text-sm text-muted-foreground">Click to upload first frame</p>
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
                  <label htmlFor="last-frame" className="block text-sm font-medium mb-2">
                    Last Frame (Optional)
                  </label>
                  {lastFrame ? (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                      <img src={lastFrame} alt="Last Frame" className="w-full h-48 object-cover" />
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
                        <p className="text-sm text-muted-foreground">Click to upload last frame</p>
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
          </Tabs>
        </div>

        <aside className="w-48 border-l border-border px-4 py-8 hidden lg:flex flex-col gap-4">
          <NavLink icon={<Home className="w-4 h-4" />} label="Home" value="home" />
          <NavLink icon={<ImageIcon className="w-4 h-4" />} label="Image" value="image" />
          <NavLink icon={<VideoIcon className="w-4 h-4" />} label="Video" value="video" />
        </aside>
      </div>
    </div>
  );
}
