import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Persistent banner shown when the browser is offline.
 * Renders nothing when online.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground"
    >
      <WifiOff className="h-4 w-4" />
      <span>You are offline. Some features may not work.</span>
    </div>
  );
}
