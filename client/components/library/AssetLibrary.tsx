import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Download,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Asset {
  id: string;
  url: string;
  asset_type: "image" | "video";
  prompt: string;
  created_at: string;
  mime_type: string;
}

interface AssetLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface AssetLibraryRef {
  refresh: () => void;
}

const AssetLibrary = forwardRef<AssetLibraryRef, AssetLibraryProps>(
  ({ open, onOpenChange }, ref) => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [filteredAssets, setFilteredAssets] = useState<Asset[]>([]);
    const [filter, setFilter] = useState<"all" | "image" | "video">("all");
    const [isLoading, setIsLoading] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const { toast } = useToast();

    // Fetch assets from API
    const fetchAssets = useCallback(
      async (assetType?: "image" | "video") => {
        setIsLoading(true);
        try {
          const url = assetType
            ? `https://veo-api-82187245577.us-central1.run.app/library?asset_type=${assetType}`
            : "https://veo-api-82187245577.us-central1.run.app/library";

          console.log("[DEBUG] Fetching assets from:", url);
          const response = await fetch(url);

          console.log("[DEBUG] Library response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[DEBUG] Library error response:", errorText);
            throw new Error(`Failed to fetch assets: ${response.status}`);
          }

          const data = await response.json();
          console.log("[DEBUG] Library data received:", data);
          console.log("[DEBUG] Number of assets:", data.assets?.length || 0);

          setAssets(data.assets || []);
          setFilteredAssets(data.assets || []);
        } catch (error) {
          console.error("Error fetching assets:", error);
          toast({
            title: "Failed to load assets",
            description:
              error instanceof Error ? error.message : "Unknown error",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      },
      [toast],
    );

    // Expose refresh function to parent
    useImperativeHandle(
      ref,
      () => ({
        refresh: () => {
          console.log("[AssetLibrary] External refresh triggered");
          fetchAssets();
        },
      }),
      [fetchAssets],
    );

    // Load assets when panel opens
    useEffect(() => {
      if (open) {
        console.log("[AssetLibrary] Panel opened, fetching assets");
        fetchAssets();
      }
    }, [open, fetchAssets]);

    // Filter assets based on selected filter
    useEffect(() => {
      if (filter === "all") {
        setFilteredAssets(assets);
      } else {
        setFilteredAssets(
          assets.filter((asset) => asset.asset_type === filter),
        );
      }
    }, [filter, assets]);

    // Delete asset
    const handleDelete = async (id: string) => {
      try {
        const response = await fetch(
          `https://veo-api-82187245577.us-central1.run.app/library/${id}`,
          { method: "DELETE" },
        );

        if (!response.ok) {
          throw new Error(`Failed to delete asset: ${response.status}`);
        }

        // Remove from local state
        setAssets(assets.filter((asset) => asset.id !== id));
        toast({
          title: "Asset deleted",
          description: "The asset has been removed from your library",
        });
      } catch (error) {
        console.error("Error deleting asset:", error);
        toast({
          title: "Failed to delete asset",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setDeleteId(null);
      }
    };

    // Download asset
    const handleDownload = async (asset: Asset) => {
      try {
        const link = document.createElement("a");
        link.href = asset.url;
        link.download = `${asset.asset_type}-${asset.id}.${asset.asset_type === "image" ? "png" : "mp4"}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error("Download error:", error);
        toast({
          title: "Download failed",
          description: "Could not download the asset",
          variant: "destructive",
        });
      }
    };

    // Format date
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>Asset Library</SheetTitle>
              <SheetDescription>
                View, download, and manage your generated images and videos
              </SheetDescription>
            </SheetHeader>

            {/* Refresh Button */}
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAssets()}
                disabled={isLoading}
                className="w-full"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh Library
              </Button>
            </div>

            {/* Filters */}
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as any)}
              className="mt-4"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="image">Images</TabsTrigger>
                <TabsTrigger value="video">Videos</TabsTrigger>
              </TabsList>

              <TabsContent value={filter} className="mt-6">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <p className="text-lg font-medium mb-2">No assets yet</p>
                    <p className="text-sm">
                      {filter === "all"
                        ? "Generate images or videos and save them to your library"
                        : `Generate ${filter}s and save them to your library`}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        {/* Thumbnail */}
                        <div
                          className="relative aspect-video bg-muted cursor-pointer"
                          onClick={() => setPreviewAsset(asset)}
                        >
                          {asset.asset_type === "image" ? (
                            <img
                              src={asset.url}
                              alt={asset.prompt}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error(
                                  "[AssetLibrary] Image failed to load:",
                                  asset.url,
                                );
                                e.currentTarget.src =
                                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" fill="%23999" font-family="monospace" font-size="12"%3EError%3C/text%3E%3C/svg%3E';
                              }}
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <video
                              src={asset.url}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error(
                                  "[AssetLibrary] Video failed to load:",
                                  asset.url,
                                );
                              }}
                              crossOrigin="anonymous"
                            />
                          )}
                          {/* Type Badge */}
                          <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5">
                            {asset.asset_type === "image" ? (
                              <ImageIcon className="w-4 h-4" />
                            ) : (
                              <VideoIcon className="w-4 h-4" />
                            )}
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-3 space-y-2">
                          <p className="text-sm font-medium line-clamp-2">
                            {asset.prompt || "No prompt"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(asset.created_at)}
                          </p>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(asset)}
                              className="flex-1"
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteId(asset.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                asset from your library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Preview Dialog */}
        <AlertDialog
          open={!!previewAsset}
          onOpenChange={() => setPreviewAsset(null)}
        >
          <AlertDialogContent className="max-w-4xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center justify-between">
                <span className="line-clamp-1">
                  {previewAsset?.prompt || "Preview"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreviewAsset(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              {previewAsset?.asset_type === "image" ? (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.prompt}
                  className="w-full h-auto"
                  onError={(e) => {
                    console.error(
                      "[AssetLibrary] Preview image failed to load:",
                      previewAsset.url,
                    );
                  }}
                  crossOrigin="anonymous"
                />
              ) : (
                <video
                  src={previewAsset?.url}
                  controls
                  className="w-full h-auto"
                  onError={(e) => {
                    console.error(
                      "[AssetLibrary] Preview video failed to load:",
                      previewAsset?.url,
                    );
                  }}
                  crossOrigin="anonymous"
                />
              )}
            </div>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => previewAsset && handleDownload(previewAsset)}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

AssetLibrary.displayName = "AssetLibrary";

export default AssetLibrary;
