import { useAuth } from "@/lib/AuthContext";

/**
 * Hook to get the current user's ID for API calls
 * Returns null if user is not authenticated
 */
export function useUserId(): string | null {
  const { user } = useAuth();
  return user?.uid || null;
}
