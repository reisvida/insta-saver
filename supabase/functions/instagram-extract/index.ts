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

// Method 1: Instagram Embed page scraping (free, no API key)
async function tryEmbed(url: string): Promise<MediaResult | null> {
  const shortcode = extractShortcode(url);
  if (!shortcode) return null;

  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.log('Embed fetch error:', res.status);
      return null;
    }

    const html = await res.text();
    console.log('Embed HTML length:', html.length);

    let thumbnail = '';
    let downloadUrl = '';
    let isVideo = false;
    let title = '';

    // Look for video URL in embed page
    const videoMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
    if (videoMatch) {
      downloadUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      isVideo = true;
    }

    // Look for display_url (image)
    const displayMatch = html.match(/"display_url"\s*:\s*"([^"]+)"/);
    if (displayMatch) {
      thumbnail = displayMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (!downloadUrl) downloadUrl = thumbnail;
    }

    // Look for image in img tags with class EmbeddedMediaImage
    if (!thumbnail) {
      const imgMatch = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/);
      if (imgMatch) {
        thumbnail = imgMatch[1].replace(/&amp;/g, '&');
        if (!downloadUrl) downloadUrl = thumbnail;
      }
    }

    // Try to find any large image src
    if (!thumbnail) {
      const imgSrc = html.match(/src="(https:\/\/[^"]*instagram[^"]*\/[^"]*\.jpg[^"]*)"/i);
      if (imgSrc) {
        thumbnail = imgSrc[1].replace(/&amp;/g, '&');
        if (!downloadUrl) downloadUrl = thumbnail;
      }
    }

    // Caption/title
    const captionMatch = html.match(/class="Caption"[^>]*>.*?<div[^>]*>(.*?)<\/div>/s);
    if (captionMatch) {
      title = captionMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 200);
    }

    if (!thumbnail && !downloadUrl) return null;
    return { thumbnail: thumbnail || downloadUrl, title, downloadUrl: downloadUrl || thumbnail, isVideo };
  } catch (e) {
    console.log('Embed failed:', e);
    return null;
  }
}

// Method 2: Instagram GraphQL query (free, no API key)
async function tryGraphQL(url: string): Promise<MediaResult | null> {
  const shortcode = extractShortcode(url);
  if (!shortcode) return null;

  try {
    const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`;
    const res = await fetch(gqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!res.ok) {
      console.log('GraphQL error:', res.status);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null;

    const data = await res.json();
    const media = data?.data?.shortcode_media;
    if (!media) return null;

    const isVideo = media.is_video || false;
    const thumbnail = media.display_url || media.thumbnail_src || '';
    const downloadUrl = isVideo ? (media.video_url || thumbnail) : thumbnail;
    const title = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';

    if (!thumbnail && !downloadUrl) return null;
    return { thumbnail, title: title.substring(0, 200), downloadUrl, isVideo };
  } catch (e) {
    console.log('GraphQL failed:', e);
    return null;
  }
}

// Method 3: RapidAPI Social Download All In One
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
      console.log(`RapidAPI error:`, res.status);
      return null;
    }

    const raw = await res.json();
    console.log('RapidAPI response:', JSON.stringify(raw).substring(0, 500));

    if (raw.error) return null;

    const medias = raw.medias || raw.data?.medias || [];
    if (Array.isArray(medias) && medias.length > 0) {
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
    return null;
  } catch (e) {
    console.log('RapidAPI failed:', e);
    return null;
  }
}

// Method 4: Instagram oEmbed (free, thumbnail only)
async function tryOEmbed(url: string): Promise<MediaResult | null> {
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`;
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return null;
    const data = await res.json();
    const thumbnail = data.thumbnail_url || '';
    if (!thumbnail) return null;
    return { thumbnail, title: data.title || '', downloadUrl: thumbnail, isVideo: false };
  } catch (e) {
    console.log('oEmbed failed:', e);
    return null;
  }
}

// Method 5: Direct OG Tags
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
    if (ogImage) { thumbnail = ogImage[1].replace(/&amp;/g, '&'); downloadUrl = thumbnail; }

    const ogVideo = html.match(/property="og:video"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:video"/i);
    if (ogVideo) { downloadUrl = ogVideo[1].replace(/&amp;/g, '&'); isVideo = true; }

    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:title"/i);
    if (ogTitle) title = ogTitle[1];

    if (!thumbnail && !downloadUrl) return null;
    return { thumbnail: thumbnail || downloadUrl, title, downloadUrl: downloadUrl || thumbnail, isVideo };
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
    let result: MediaResult | null = null;
    let methodUsed = '';

    // Fallback chain: Embed → GraphQL → RapidAPI → oEmbed → OG Tags
    const methods = [
      { name: 'Embed', fn: () => tryEmbed(url) },
      { name: 'GraphQL', fn: () => tryGraphQL(url) },
      { name: 'RapidAPI', fn: () => tryRapidAPI(url) },
      { name: 'oEmbed', fn: () => tryOEmbed(url) },
      { name: 'OGTags', fn: () => tryOGTags(url) },
    ];

    for (const method of methods) {
      console.log(`Trying ${method.name}...`);
      result = await method.fn();
      if (result) { methodUsed = method.name; break; }
    }

    if (!result) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract media. Try again or use a different link.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extraction successful via:', methodUsed);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url, shortcode, type: mediaType,
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
