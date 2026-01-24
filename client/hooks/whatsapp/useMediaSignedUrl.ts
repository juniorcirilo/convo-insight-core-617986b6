import { useState, useEffect } from "react";

// Check if the URL is a local storage path
function isLocalStoragePath(url: string): boolean {
  return url.startsWith('/storage/') || url.startsWith('storage/');
}

// Check if it's an external URL (http/https)
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

// Check if it's a legacy Supabase storage path (instance/filename format)
function isLegacySupabasePath(url: string): boolean {
  // Legacy paths look like: "ti-suporte/1769022145177-3EB0577E7D6E4192823811.jpeg"
  // They have instance name followed by filename, no /storage/ prefix
  if (isLocalStoragePath(url) || isExternalUrl(url)) return false;
  const parts = url.split('/');
  return parts.length === 2 && !parts[0].includes(':');
}

// Convert legacy Supabase path to local storage path
function convertLegacyToLocalPath(url: string): string {
  // Convert "ti-suporte/1769022145177-3EB0577E7D6E4192823811.jpeg" 
  // to "/storage/whatsapp-media/ti-suporte/1769022145177-3EB0577E7D6E4192823811.jpeg"
  return `/storage/whatsapp-media/${url}`;
}

export function useMediaSignedUrl(
  mediaUrl: string | null | undefined,
  conversationId?: string
) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setSignedUrl(null);
      return;
    }

    // If it's a local storage path, use it directly
    if (isLocalStoragePath(mediaUrl)) {
      // Ensure it starts with /
      const normalizedUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
      setSignedUrl(normalizedUrl);
      return;
    }

    // If it's already an external URL, use it directly
    if (isExternalUrl(mediaUrl)) {
      setSignedUrl(mediaUrl);
      return;
    }

    // If it's a legacy Supabase storage path, convert to local storage path
    // This handles migrated files
    if (isLegacySupabasePath(mediaUrl)) {
      const localPath = convertLegacyToLocalPath(mediaUrl);
      setSignedUrl(localPath);
      return;
    }

    // Fallback: For other paths, try to fetch signed URL from Supabase
    // This maintains backwards compatibility with any edge cases
    const fetchSignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { supabase } = await import('@/integrations/api/client');
        
        const { data, error: fnError } = await supabase.functions.invoke('get-media-signed-url', {
          body: { filePath: mediaUrl, conversationId }
        });

        if (fnError) {
          throw fnError;
        }

        if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
        } else {
          throw new Error('No signed URL returned');
        }
      } catch (err: any) {
        console.error('[useMediaSignedUrl] Error fetching signed URL:', err);
        setError(err.message);
        // Fallback: try local storage path
        setSignedUrl(convertLegacyToLocalPath(mediaUrl));
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignedUrl();
  }, [mediaUrl, conversationId]);

  return { signedUrl, isLoading, error };
}

// Utility to get media URL (for components that can't use hooks)
export async function getMediaSignedUrl(
  mediaUrl: string,
  conversationId?: string
): Promise<string> {
  // If it's a local storage path, return directly
  if (isLocalStoragePath(mediaUrl)) {
    return mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
  }

  // If it's an external URL, return directly
  if (isExternalUrl(mediaUrl)) {
    return mediaUrl;
  }

  // If it's a legacy Supabase storage path, convert to local path
  if (isLegacySupabasePath(mediaUrl)) {
    return convertLegacyToLocalPath(mediaUrl);
  }

  // Fallback: try to fetch signed URL for unknown formats
  try {
    const { supabase } = await import('@/integrations/api/client');
    
    const { data, error } = await supabase.functions.invoke('get-media-signed-url', {
      body: { filePath: mediaUrl, conversationId }
    });

    if (error || !data?.signedUrl) {
      // Return local path as fallback
      return convertLegacyToLocalPath(mediaUrl);
    }

    return data.signedUrl;
  } catch {
    // Return local path as fallback
    return convertLegacyToLocalPath(mediaUrl);
  }
}
