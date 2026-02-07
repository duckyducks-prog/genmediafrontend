import { logger } from "@/lib/logger";
import { auth } from "./firebase";
import { API_ENDPOINTS } from "./api-config";
import { parseApiError, parseNetworkError, isApiError } from "./api-error";

interface SaveToLibraryParams {
  imageUrl: string; // data URI or URL
  prompt: string;
  assetType: "image" | "video";
}

export async function saveToLibrary(params: SaveToLibraryParams) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  // Extract base64 if it's a data URI
  let base64Data = params.imageUrl;
  let mimeType = "image/png";

  if (params.imageUrl.startsWith("data:")) {
    const parts = params.imageUrl.split(",");
    base64Data = parts[1];
    // Extract mime type from data:image/png;base64,
    const mimeMatch = parts[0].match(/data:([^;]+)/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }
  }

  logger.debug("[saveToLibrary] Saving to library:", {
    assetType: params.assetType,
    mimeType,
    promptLength: params.prompt.length,
  });

  try {
    const response = await fetch(API_ENDPOINTS.library.save, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: base64Data,
        prompt: params.prompt,
        asset_type: params.assetType,
        mime_type: mimeType,
      }),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const result = await response.json();
    logger.debug("[saveToLibrary] Success:", result);
    return result;
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}
