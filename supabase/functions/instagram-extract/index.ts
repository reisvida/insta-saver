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
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');

    let thumbnail = '';
    let title = '';
    let downloadUrl = '';
    let isVideo = false;

    // Method 1: RapidAPI Instagram Scraper
    if (rapidApiKey) {
      try {
        const apiUrl = `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(url)}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'x-rapidapi-host': 'instagram-scraper-api2.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey,
          },
        });

        if (apiRes.ok) {
          const apiData = await apiRes.json();
          console.log('RapidAPI response keys:', Object.keys(apiData));
          const data = apiData.data || apiData;

          if (data) {
            // Handle carousel/sidecar posts
            if (data.carousel_media || data.resources) {
              const items = data.carousel_media || data.resources || [];
              const first = items[0];
              if (first) {
                thumbnail = first.thumbnail_url || first.display_url || first.image_versions2?.candidates?.[0]?.url || '';
                isVideo = first.video_url ? true : false;
                downloadUrl = first.video_url || thumbnail;
              }
            }

            // Single media
            if (!thumbnail) {
              thumbnail = data.thumbnail_url || data.display_url || data.image_versions2?.candidates?.[0]?.url || '';
              isVideo = !!data.video_url || data.media_type === 2 || data.is_video;
              downloadUrl = data.video_url || data.video_versions?.[0]?.url || thumbnail;
            }

            title = data.caption?.text || data.accessibility_caption || '';
          }
        } else {
          console.log('RapidAPI error status:', apiRes.status, await apiRes.text());
        }
      } catch (e) {
        console.log('RapidAPI method failed:', e);
      }
    }

    // Method 2: Fallback to oEmbed
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

    // Method 3: Fallback to OG tags
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

    if (!thumbnail && !downloadUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Could not extract media. Try again or use a different link.',
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
