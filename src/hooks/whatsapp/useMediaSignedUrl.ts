import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache for signed URLs to avoid redundant requests
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Cache duration: 55 minutes (less than the 1 hour expiry from the edge function)
const CACHE_DURATION_MS = 55 * 60 * 1000;

// Check if the string is a file path (not a URL)
function isFilePath(str: string): boolean {
  // File paths don't start with http/https and don't contain ://
  return !str.startsWith('http://') && !str.startsWith('https://') && !str.includes('://');
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

    // If it's already a signed URL (contains token), use it directly
    if (mediaUrl.includes('token=')) {
      setSignedUrl(mediaUrl);
      return;
    }

    // Determine the file path
    let filePath = mediaUrl;
    
    // If it's a full URL, extract the path
    if (!isFilePath(mediaUrl)) {
      const storagePathMatch = mediaUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/whatsapp-media\/(.+)/);
      if (storagePathMatch) {
        filePath = storagePathMatch[1];
      } else {
        // External URL, use directly
        setSignedUrl(mediaUrl);
        return;
      }
    }

    // Check cache first
    const cached = signedUrlCache.get(filePath);
    if (cached && cached.expiresAt > Date.now()) {
      setSignedUrl(cached.url);
      return;
    }

    // Fetch signed URL
    const fetchSignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-media-signed-url', {
          body: { filePath, conversationId }
        });

        if (fnError) {
          throw fnError;
        }

        if (data?.signedUrl) {
          // Cache the signed URL
          signedUrlCache.set(filePath, {
            url: data.signedUrl,
            expiresAt: Date.now() + CACHE_DURATION_MS
          });
          setSignedUrl(data.signedUrl);
        } else {
          throw new Error('No signed URL returned');
        }
      } catch (err: any) {
        console.error('[useMediaSignedUrl] Error fetching signed URL:', err);
        setError(err.message);
        // Don't fallback to mediaUrl as it's a path, not a URL
        setSignedUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignedUrl();
  }, [mediaUrl, conversationId]);

  return { signedUrl, isLoading, error };
}

// Utility to get signed URL imperatively (for components that can't use hooks)
export async function getMediaSignedUrl(
  mediaUrl: string,
  conversationId?: string
): Promise<string> {
  // If it's already a signed URL, return it
  if (mediaUrl.includes('token=')) {
    return mediaUrl;
  }

  // Determine the file path
  let filePath = mediaUrl;
  
  // If it's a full URL, extract the path
  if (!isFilePath(mediaUrl)) {
    const storagePathMatch = mediaUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/whatsapp-media\/(.+)/);
    if (storagePathMatch) {
      filePath = storagePathMatch[1];
    } else {
      // External URL, return directly
      return mediaUrl;
    }
  }

  // Check cache
  const cached = signedUrlCache.get(filePath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Fetch signed URL
  const { data, error } = await supabase.functions.invoke('get-media-signed-url', {
    body: { filePath, conversationId }
  });

  if (error || !data?.signedUrl) {
    console.error('[getMediaSignedUrl] Error:', error);
    throw new Error('Failed to get signed URL');
  }

  // Cache it
  signedUrlCache.set(filePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + CACHE_DURATION_MS
  });

  return data.signedUrl;
}
