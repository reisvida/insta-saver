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

    let thumbnail = '';
    let title = '';
    let downloadUrl = '';
    let isVideo = false;

    // Method 1: Try Instagram's GraphQL endpoint (works for public posts)
    if (shortcode) {
      try {
        const graphqlUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        const graphqlRes = await fetch(graphqlUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-IG-App-ID': '936619743392459',
          },
        });

        if (graphqlRes.ok) {
          const contentType = graphqlRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await graphqlRes.json();
            const media = data?.graphql?.shortcode_media || data?.items?.[0];
            
            if (media) {
              thumbnail = media.display_url || media.thumbnail_src || media.image_versions2?.candidates?.[0]?.url || '';
              title = media.edge_media_to_caption?.edges?.[0]?.node?.text || media.caption?.text || '';
              isVideo = media.is_video || media.media_type === 2;
              
              if (isVideo) {
                downloadUrl = media.video_url || media.video_versions?.[0]?.url || '';
              } else {
                downloadUrl = thumbnail;
              }
            }
          }
        }
      } catch (e) {
        console.log('GraphQL method failed:', e);
      }
    }

    // Method 2: Try oEmbed (gets thumbnail at least)
    if (!thumbnail) {
      try {
        const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`;
        const oembedRes = await fetch(oembedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          },
        });
        
        if (oembedRes.ok) {
          const contentType = oembedRes.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const oembedData = await oembedRes.json();
            thumbnail = oembedData.thumbnail_url || '';
            title = oembedData.title || '';
            if (thumbnail) downloadUrl = thumbnail;
          }
        }
      } catch (e) {
        console.log('oEmbed failed:', e);
      }
    }

    // Method 3: Fetch page and parse OG tags
    if (!thumbnail) {
      try {
        const pageRes = await fetch(url, {
          headers: {
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        });

        if (pageRes.ok) {
          const html = await pageRes.text();
          
          const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) 
            || html.match(/content="([^"]+)"\s+property="og:image"/i);
          if (ogImageMatch) {
            thumbnail = ogImageMatch[1].replace(/&amp;/g, '&');
            downloadUrl = thumbnail;
          }

          const ogVideoMatch = html.match(/property="og:video"\s+content="([^"]+)"/i)
            || html.match(/content="([^"]+)"\s+property="og:video"/i);
          if (ogVideoMatch) {
            downloadUrl = ogVideoMatch[1].replace(/&amp;/g, '&');
            isVideo = true;
          }

          const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/i)
            || html.match(/content="([^"]+)"\s+property="og:title"/i);
          if (ogTitleMatch) title = ogTitleMatch[1];
        }
      } catch (e) {
        console.log('Page fetch failed:', e);
      }
    }

    // If we still have nothing, return an error
    if (!thumbnail && !downloadUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Could not extract media. Instagram may be blocking the request. Try again or use a different link.',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          shortcode,
          type: mediaType,
          thumbnail,
          title: title.substring(0, 200),
          downloadUrl: downloadUrl || thumbnail,
          isVideo,
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
