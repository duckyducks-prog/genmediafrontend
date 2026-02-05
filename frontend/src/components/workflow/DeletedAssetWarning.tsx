import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DeletedAssetWarningProps {
  assetId: string;
  assetType: "image" | "video" | "frame";
  onClearReference?: () => void;
}

/**
 * Warning component shown when a workflow references a deleted asset
 * Part of Firestore migration - handles broken asset references gracefully
 */
export function DeletedAssetWarning({
  assetId,
  assetType,
  onClearReference,
}: DeletedAssetWarningProps) {
  return (
    <Alert variant="destructive" className="border-yellow-500 bg-yellow-50">
      <AlertCircle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-800">
        Referenced {assetType} was deleted
      </AlertTitle>
      <AlertDescription className="text-yellow-700 text-xs">
        <div className="space-y-2">
          <p>Asset ID: {assetId.substring(0, 20)}...</p>
          <p>
            This {assetType} has been removed from your library. The reference
            is preserved in case it becomes available again.
          </p>
          {onClearReference && (
            <Button
              size="sm"
              variant="outline"
              onClick={onClearReference}
              className="mt-2 text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Clear Reference
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
