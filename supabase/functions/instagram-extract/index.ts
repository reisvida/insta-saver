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

interface MediaResult {
  thumbnail: string;
  title: string;
  downloadUrl: string;
  isVideo: boolean;
}

// Method 1: Firecrawl - scrape Instagram page for OG/meta tags
async function tryFirecrawl(url: string): Promise<MediaResult | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.log('FIRECRAWL_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html'],
        onlyMainContent: false,
        waitFor: 2000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.log('Firecrawl error:', response.status, errBody);
      return null;
    }

    const result = await response.json();
    const html = result.data?.html || result.html || '';
    if (!html) {
      console.log('Firecrawl: no HTML returned');
      return null;
    }

    console.log('Firecrawl: got HTML, length:', html.length);

    let thumbnail = '';
    let downloadUrl = '';
    let isVideo = false;
    let title = '';

    // Extract OG tags
    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogImage) {
      thumbnail = ogImage[1].replace(/&amp;/g, '&');
      downloadUrl = thumbnail;
    }

    const ogVideo = html.match(/property="og:video(?::url)?"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:video(?::url)?"/i);
    if (ogVideo) {
      downloadUrl = ogVideo[1].replace(/&amp;/g, '&');
      isVideo = true;
    }

    const ogTitle = html.match(/property="og:(?:title|description)"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:(?:title|description)"/i);
    if (ogTitle) title = ogTitle[1];

    // Also try to find video URLs in the page source
    if (!isVideo) {
      const videoUrl = html.match(/"video_url"\s*:\s*"([^"]+)"/);
      if (videoUrl) {
        downloadUrl = videoUrl[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        isVideo = true;
      }
    }

    // Try to find display_url for images
    if (!thumbnail) {
      const displayUrl = html.match(/"display_url"\s*:\s*"([^"]+)"/);
      if (displayUrl) {
        thumbnail = displayUrl[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        if (!downloadUrl) downloadUrl = thumbnail;
      }
    }

    if (!thumbnail && !downloadUrl) return null;
    return { thumbnail: thumbnail || downloadUrl, title, downloadUrl: downloadUrl || thumbnail, isVideo };
  } catch (e) {
    console.log('Firecrawl failed:', e);
    return null;
  }
}

// Method 2: Instagram oEmbed (free, no key needed)
async function tryOEmbed(url: string): Promise<MediaResult | null> {
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`;
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null;

    const data = await res.json();
    const thumbnail = data.thumbnail_url || '';
    if (!thumbnail) return null;

    return { thumbnail, title: data.title || '', downloadUrl: thumbnail, isVideo: false };
  } catch (e) {
    console.log('oEmbed failed:', e);
    return null;
  }
}

// Method 3: Direct OG Tags scraping (free, no key needed)
async function tryOGTags(url: string): Promise<MediaResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const html = await res.text();
    let thumbnail = '';
    let downloadUrl = '';
    let isVideo = false;
    let title = '';

    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogImage) {
      thumbnail = ogImage[1].replace(/&amp;/g, '&');
      downloadUrl = thumbnail;
    }

    const ogVideo = html.match(/property="og:video"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:video"/i);
    if (ogVideo) {
      downloadUrl = ogVideo[1].replace(/&amp;/g, '&');
      isVideo = true;
    }

    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:title"/i);
    if (ogTitle) title = ogTitle[1];

    if (!thumbnail && !downloadUrl) return null;
    return { thumbnail, title, downloadUrl: downloadUrl || thumbnail, isVideo };
  } catch (e) {
    console.log('OG tags failed:', e);
    return null;
  }
}

// Method 4: Social Download All In One (RapidAPI)
async function tryRapidAPI(url: string): Promise<MediaResult | null> {
  const apiKey = Deno.env.get('RAPIDAPI_KEY');
  if (!apiKey) return null;

  const host = 'social-download-all-in-one.p.rapidapi.com';
  try {
    const res = await fetch(`https://${host}/v1/social/autolink`, {
      method: 'POST',
      headers: {
        'x-rapidapi-host': host,
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`RapidAPI ${host} error:`, res.status, errText);
      return null;
    }

    const raw = await res.json();
    console.log(`RapidAPI response keys:`, JSON.stringify(Object.keys(raw)));

    // This API returns medias array with url, thumbnail, quality, type
    const medias = raw.medias || raw.data?.medias || [];
    if (Array.isArray(medias) && medias.length > 0) {
      // Pick the best quality video or image
      const videos = medias.filter((m: any) => m.type === 'video');
      const images = medias.filter((m: any) => m.type === 'image');
      const best = videos.length > 0 ? videos[0] : images[0] || medias[0];
      
      const thumbnail = raw.thumbnail || best.thumbnail || best.preview || '';
      const downloadUrl = best.url || best.download_url || '';
      const isVideo = best.type === 'video';
      const title = raw.title || raw.caption || '';
      
      if (downloadUrl || thumbnail) {
        return { thumbnail: thumbnail || downloadUrl, title, downloadUrl: downloadUrl || thumbnail, isVideo };
      }
    }

    // Single object response
    const thumbnail = raw.thumbnail || raw.image || '';
    const downloadUrl = raw.url || raw.download_url || '';
    if (downloadUrl || thumbnail) {
      return { thumbnail: thumbnail || downloadUrl, title: raw.title || '', downloadUrl: downloadUrl || thumbnail, isVideo: !!raw.video };
    }

    return null;
  } catch (e) {
    console.log(`RapidAPI failed:`, e);
    return null;
  }
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

    let result: MediaResult | null = null;
    let methodUsed = '';

    // Fallback chain
    console.log('Trying Firecrawl...');
    result = await tryFirecrawl(url);
    if (result) methodUsed = 'Firecrawl';

    if (!result) {
      console.log('Trying RapidAPI...');
      result = await tryRapidAPI(url);
      if (result) methodUsed = 'RapidAPI';
    }

    if (!result) {
      console.log('Trying oEmbed...');
      result = await tryOEmbed(url);
      if (result) methodUsed = 'oEmbed';
    }

    if (!result) {
      console.log('Trying OG tags...');
      result = await tryOGTags(url);
      if (result) methodUsed = 'OGTags';
    }

    if (!result) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Could not extract media. Try again or use a different link.',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extraction successful via:', methodUsed);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          shortcode,
          type: mediaType,
          thumbnail: result.thumbnail,
          title: result.title.substring(0, 200),
          downloadUrl: result.downloadUrl || result.thumbnail,
          isVideo: result.isVideo,
          method: methodUsed,
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
