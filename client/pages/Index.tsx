import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Download, Loader2, Image as ImageIcon, Video as VideoIcon, Upload, X } from "lucide-react";

export default function Index() {
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
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

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;

    setIsGeneratingImage(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setImageResult(`https://picsum.photos/seed/${Date.now()}/800/600`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;
    
    setIsGeneratingVideo(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setVideoResult("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              AI Studio
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Generate stunning images and videos with AI
          </p>
        </header>

        <Tabs defaultValue="image" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="image" className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Image
            </TabsTrigger>
            <TabsTrigger value="video" className="flex items-center gap-2">
              <VideoIcon className="w-4 h-4" />
              Video
            </TabsTrigger>
          </TabsList>

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
            <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
              <label htmlFor="video-prompt" className="block text-sm font-medium mb-2">
                Describe your video
              </label>
              <Textarea
                id="video-prompt"
                placeholder="A time-lapse of a bustling city transitioning from day to night..."
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                className="mb-4 min-h-[100px]"
              />
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
    </div>
  );
}
