import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache for signed URLs to avoid redundant requests
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Cache duration: 55 minutes (less than the 1 hour expiry from the edge function)
const CACHE_DURATION_MS = 55 * 60 * 1000;

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

    // If it's already a signed URL or external URL, use it directly
    if (mediaUrl.includes('token=') || !mediaUrl.includes('supabase')) {
      setSignedUrl(mediaUrl);
      return;
    }

    // Extract file path from full URL if necessary
    let filePath = mediaUrl;
    const storagePathMatch = mediaUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/whatsapp-media\/(.+)/);
    if (storagePathMatch) {
      filePath = storagePathMatch[1];
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
        // Fallback to original URL (may not work if bucket is private)
        setSignedUrl(mediaUrl);
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
  // If it's already a signed URL or external URL, return it
  if (mediaUrl.includes('token=') || !mediaUrl.includes('supabase')) {
    return mediaUrl;
  }

  // Extract file path
  let filePath = mediaUrl;
  const storagePathMatch = mediaUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/whatsapp-media\/(.+)/);
  if (storagePathMatch) {
    filePath = storagePathMatch[1];
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
    return mediaUrl; // Fallback
  }

  // Cache it
  signedUrlCache.set(filePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + CACHE_DURATION_MS
  });

  return data.signedUrl;
}
