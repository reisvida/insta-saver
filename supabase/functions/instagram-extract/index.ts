const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function detectType(url: string): string {
  if (/\/reel(s)?\//.test(url)) return "Reel";
  if (/\/p\//.test(url)) return "Post";
  if (/\/stories\//.test(url)) return "Story";
  if (/\/tv\//.test(url)) return "IGTV";
  return "Post";
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shortcode = extractShortcode(url);
    const mediaType = detectType(url);

    // Try fetching Instagram's oEmbed endpoint (public, no auth needed)
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
    
    let thumbnail = '';
    let title = '';

    try {
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        thumbnail = oembedData.thumbnail_url || '';
        title = oembedData.title || '';
      }
    } catch (e) {
      console.log('oEmbed failed, trying fallback:', e);
    }

    // Fallback: fetch the page and extract OG meta tags
    if (!thumbnail) {
      try {
        const pageRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (pageRes.ok) {
          const html = await pageRes.text();
          
          // Extract og:image
          const ogImageMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i) 
            || html.match(/content="([^"]+)"\s+(?:property|name)="og:image"/i);
          if (ogImageMatch) thumbnail = ogImageMatch[1];

          // Extract og:video for reels
          const ogVideoMatch = html.match(/<meta\s+(?:property|name)="og:video"\s+content="([^"]+)"/i)
            || html.match(/content="([^"]+)"\s+(?:property|name)="og:video"/i);
          
          // Extract og:title
          const ogTitleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i)
            || html.match(/content="([^"]+)"\s+(?:property|name)="og:title"/i);
          if (ogTitleMatch) title = ogTitleMatch[1];

          if (ogVideoMatch) {
            return new Response(
              JSON.stringify({
                success: true,
                data: {
                  url,
                  shortcode,
                  type: mediaType,
                  thumbnail,
                  title,
                  downloadUrl: ogVideoMatch[1],
                  isVideo: true,
                },
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (e) {
        console.log('Page fetch fallback failed:', e);
      }
    }

    // Return what we have
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          shortcode,
          type: mediaType,
          thumbnail,
          title,
          downloadUrl: thumbnail, // For images, the thumbnail IS the download
          isVideo: false,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Extraction error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Extraction failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
