import { auth } from "./firebase";

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

  console.log("[saveToLibrary] Saving to library:", {
    assetType: params.assetType,
    mimeType,
    promptLength: params.prompt.length,
  });

  const response = await fetch(
    "https://veo-api-82187245577.us-central1.run.app/library/save",
    {
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
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[saveToLibrary] Failed:", {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(
      `Failed to save to library: ${response.status} ${response.statusText}`,
    );
  }

  const result = await response.json();
  console.log("[saveToLibrary] Success:", result);
  return result;
}
