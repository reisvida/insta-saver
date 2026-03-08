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

// Method 1: RapidAPI Instagram Scraper Stable API
async function tryScraperStable(url: string, apiKey: string): Promise<MediaResult | null> {
  try {
    const shortcode = extractShortcode(url);
    if (!shortcode) return null;

    const apiUrl = `https://instagram-scraper-stable-api.p.rapidapi.com/get_post_data.php?post_code=${shortcode}`;
    const res = await fetch(apiUrl, {
      headers: {
        'x-rapidapi-host': 'instagram-scraper-stable-api.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
    });

    if (!res.ok) {
      console.log('ScraperStable error:', res.status);
      return null;
    }

    const raw = await res.json();
    console.log('ScraperStable response keys:', JSON.stringify(Object.keys(raw)));
    return parseGenericMediaResponse(raw);
  } catch (e) {
    console.log('ScraperStable failed:', e);
    return null;
  }
}

function parseGenericMediaResponse(raw: any): MediaResult | null {
  const data = raw.data || raw.result || raw;
  if (!data) return null;

  let thumbnail = '';
  let downloadUrl = '';
  let isVideo = false;
  let title = '';

  // Carousel
  const items = data.carousel_media || data.resources || data.carousel;
  if (items && Array.isArray(items) && items.length > 0) {
    const first = items[0];
    thumbnail = first.thumbnail_url || first.display_url || first.image_versions2?.candidates?.[0]?.url || first.url || '';
    isVideo = !!first.video_url || first.media_type === 2;
    downloadUrl = first.video_url || thumbnail;
  }

  // Single media
  if (!thumbnail) {
    thumbnail = data.thumbnail_url || data.display_url || data.image_versions2?.candidates?.[0]?.url || data.thumbnail || data.image || '';
    isVideo = !!data.video_url || data.media_type === 2 || data.is_video || !!data.video;
    downloadUrl = data.video_url || data.video_versions?.[0]?.url || data.video || data.download_url || thumbnail;
  }

  title = data.caption?.text || data.accessibility_caption || data.title || '';
  if (typeof title !== 'string') title = '';

  if (!thumbnail && !downloadUrl) return null;
  return { thumbnail, title, downloadUrl: downloadUrl || thumbnail, isVideo };
}

// Method 2: RapidAPI Instagram Looter2
async function tryLooter2(url: string, apiKey: string): Promise<MediaResult | null> {
  try {
    const res = await fetch('https://instagram-looter2.p.rapidapi.com/post-dl', {
      method: 'POST',
      headers: {
        'x-rapidapi-host': 'instagram-looter2.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ link: url }),
    });

    if (!res.ok) {
      console.log('Looter2 error:', res.status);
      return null;
    }

    const data = await res.json();
    console.log('Looter2 response keys:', Object.keys(data));

    // Looter2 typically returns an array of media items
    const items = data.data || data.media || data.result || data;
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      const thumbnail = first.thumbnail || first.image || first.url || '';
      const isVideo = first.type === 'video' || !!first.video;
      const downloadUrl = first.video || first.url || first.download_url || thumbnail;
      return { thumbnail, title: data.title || data.caption || '', downloadUrl, isVideo };
    }

    // Single object response
    if (data.thumbnail || data.image || data.download_url) {
      const thumbnail = data.thumbnail || data.image || '';
      const isVideo = data.type === 'video' || !!data.video;
      const downloadUrl = data.video || data.download_url || data.url || thumbnail;
      return { thumbnail, title: data.title || data.caption || '', downloadUrl, isVideo };
    }

    return null;
  } catch (e) {
    console.log('Looter2 failed:', e);
    return null;
  }
}

// Method 3: RapidAPI SaveFrom Downloader
async function trySaveFrom(url: string, apiKey: string): Promise<MediaResult | null> {
  try {
    const res = await fetch(`https://savefrom-downloader.p.rapidapi.com/smdown`, {
      method: 'POST',
      headers: {
        'x-rapidapi-host': 'savefrom-downloader.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      console.log('SaveFrom error:', res.status);
      return null;
    }

    const data = await res.json();
    console.log('SaveFrom response keys:', Object.keys(data));

    const links = data.data?.links || data.links || [];
    const thumbnail = data.data?.thumbnail || data.thumbnail || data.data?.image || '';
    const title = data.data?.title || data.title || '';

    if (links.length > 0) {
      // Pick highest quality link
      const best = links.sort((a: any, b: any) => (b.quality_number || 0) - (a.quality_number || 0))[0];
      const downloadUrl = best?.url || best?.link || '';
      const isVideo = best?.type?.includes('video') || /\.mp4/i.test(downloadUrl);
      return { thumbnail: thumbnail || downloadUrl, title, downloadUrl, isVideo };
    }

    if (thumbnail) {
      return { thumbnail, title, downloadUrl: thumbnail, isVideo: false };
    }

    return null;
  } catch (e) {
    console.log('SaveFrom failed:', e);
    return null;
  }
}

// Method 4: Instagram oEmbed
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

// Method 5: OG Tags scraping
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

    let result: MediaResult | null = null;
    let methodUsed = '';

    // Fallback chain: try each method in order
    if (rapidApiKey) {
      console.log('Trying ScraperStable...');
      result = await tryScraperStable(url, rapidApiKey);
      if (result) methodUsed = 'ScraperStable';

      if (!result) {
        console.log('Trying Looter2...');
        result = await tryLooter2(url, rapidApiKey);
        if (result) methodUsed = 'Looter2';
      }

      if (!result) {
        console.log('Trying SaveFrom...');
        result = await trySaveFrom(url, rapidApiKey);
        if (result) methodUsed = 'SaveFrom';
      }
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
