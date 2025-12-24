import JSZip from "jszip";

export interface MediaFile {
  type: "image" | "video";
  url: string;
  index: number;
}

/**
 * Convert base64 data URL to Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const header = parts[0];
  const data = parts[1];

  // Extract MIME type from header (e.g., "data:image/png;base64" -> "image/png")
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";

  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/octet-stream": "bin",
  };
  return mimeToExt[mimeType] || "bin";
}

/**
 * Generate ZIP file from multiple media files
 */
export async function createMediaZip(files: MediaFile[]): Promise<Blob> {
  const zip = new JSZip();
  const mediaFolder = zip.folder("media");

  if (!mediaFolder) {
    throw new Error("Failed to create media folder in ZIP");
  }

  for (const file of files) {
    // Convert data URL to Blob
    const blob = dataUrlToBlob(file.url);

    // Determine file name
    const ext = getFileExtension(blob.type);
    const fileName = `${file.type}-${String(file.index).padStart(3, "0")}.${ext}`;

    // Add to ZIP
    mediaFolder.file(fileName, blob);
  }

  // Generate ZIP blob
  return await zip.generateAsync({ type: "blob" });
}

/**
 * Trigger download of a blob
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Download single file
 */
export async function downloadMediaFile(
  dataUrl: string,
  type: "image" | "video",
  index: number
): Promise<void> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = getFileExtension(blob.type);
  const fileName = `${type}-${String(index).padStart(3, "0")}.${ext}`;
  downloadBlob(blob, fileName);
}
