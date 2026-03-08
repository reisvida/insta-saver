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

// Method 1: Instagram JSON API (?__a=1&__d=dis)
async function tryJsonAPI(url: string): Promise<MediaResult | null> {
  const shortcode = extractShortcode(url);
  if (!shortcode) return null;

  // Try both /p/ and /reel/ paths
  const paths = [`/p/${shortcode}`, `/reel/${shortcode}`];
  
  for (const path of paths) {
    try {
      const apiUrl = `https://www.instagram.com${path}/?__a=1&__d=dis`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100)',
          'Accept': '*/*',
          'X-IG-App-ID': '936619743392459',
        },
      });

      console.log(`JSON API ${path} status:`, res.status);
      if (!res.ok) continue;

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) {
        console.log('JSON API: not JSON response');
        continue;
      }

      const data = await res.json();
      const items = data?.items || data?.graphql?.shortcode_media ? [data.graphql.shortcode_media] : [];
      
      if (items.length === 0) {
        // Try nested structure
        const media = data?.data?.xdt_shortcode_media || data?.graphql?.shortcode_media;
        if (media) items.push(media);
      }

      if (items.length > 0) {
        const item = items[0];
        const isVideo = item.is_video || item.media_type === 2 || item.video_versions?.length > 0;
        let thumbnail = item.display_url || item.thumbnail_src || item.image_versions2?.candidates?.[0]?.url || '';
        let downloadUrl = thumbnail;
        
        if (isVideo) {
          downloadUrl = item.video_url || item.video_versions?.[0]?.url || thumbnail;
        }

        const caption = item.edge_media_to_caption?.edges?.[0]?.node?.text || item.caption?.text || '';

        if (thumbnail || downloadUrl) {
          console.log('JSON API: found media');
          return { thumbnail: thumbnail || downloadUrl, title: caption.substring(0, 200), downloadUrl: downloadUrl || thumbnail, isVideo };
        }
      }
    } catch (e) {
      console.log(`JSON API ${path} failed:`, e);
    }
  }
  return null;
}

// Method 2: Mobile i.instagram.com API
async function tryMobileAPI(url: string): Promise<MediaResult | null> {
  const shortcode = extractShortcode(url);
  if (!shortcode) return null;

  // Convert shortcode to media ID
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let mediaId = BigInt(0);
  for (const char of shortcode) {
    mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(char));
  }

  try {
    const res = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100)',
        'X-IG-App-ID': '936619743392459',
      },
    });

    console.log('Mobile API status:', res.status);
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return null;

    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;

    const isVideo = item.media_type === 2 || item.video_versions?.length > 0;
    const thumbnail = item.image_versions2?.candidates?.[0]?.url || '';
    const downloadUrl = isVideo ? (item.video_versions?.[0]?.url || thumbnail) : thumbnail;
    const caption = item.caption?.text || '';

    if (thumbnail || downloadUrl) {
      console.log('Mobile API: found media');
      return { thumbnail: thumbnail || downloadUrl, title: caption.substring(0, 200), downloadUrl: downloadUrl || thumbnail, isVideo };
    }
    return null;
  } catch (e) {
    console.log('Mobile API failed:', e);
    return null;
  }
}

// Method 3: RapidAPI
async function tryRapidAPI(url: string): Promise<MediaResult | null> {
  const apiKey = Deno.env.get('RAPIDAPI_KEY');
  if (!apiKey) return null;

  const host = 'social-download-all-in-one.p.rapidapi.com';
  try {
    const res = await fetch(`https://${host}/v1/social/autolink`, {
      method: 'POST',
      headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) { console.log('RapidAPI error:', res.status); return null; }
    const raw = await res.json();
    console.log('RapidAPI:', JSON.stringify(raw).substring(0, 200));
    if (raw.error) return null;

    const medias = raw.medias || [];
    if (Array.isArray(medias) && medias.length > 0) {
      const videos = medias.filter((m: any) => m.type === 'video');
      const best = videos.length > 0 ? videos[0] : medias[0];
      const thumbnail = raw.thumbnail || best.thumbnail || '';
      const downloadUrl = best.url || '';
      if (downloadUrl || thumbnail) {
        return { thumbnail: thumbnail || downloadUrl, title: raw.title || '', downloadUrl: downloadUrl || thumbnail, isVideo: best.type === 'video' };
      }
    }
    return null;
  } catch (e) { console.log('RapidAPI failed:', e); return null; }
}

// Method 4: oEmbed (thumbnail only)
async function tryOEmbed(url: string): Promise<MediaResult | null> {
  try {
    const res = await fetch(`https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return null;
    const data = await res.json();
    if (!data.thumbnail_url) return null;
    return { thumbnail: data.thumbnail_url, title: data.title || '', downloadUrl: data.thumbnail_url, isVideo: false };
  } catch (e) { console.log('oEmbed failed:', e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const shortcode = extractShortcode(url);
    const mediaType = detectType(url);
    let result: MediaResult | null = null;
    let methodUsed = '';

    const methods = [
      { name: 'JsonAPI', fn: () => tryJsonAPI(url) },
      { name: 'MobileAPI', fn: () => tryMobileAPI(url) },
      { name: 'RapidAPI', fn: () => tryRapidAPI(url) },
      { name: 'oEmbed', fn: () => tryOEmbed(url) },
    ];

    for (const method of methods) {
      console.log(`Trying ${method.name}...`);
      result = await method.fn();
      if (result) { methodUsed = method.name; break; }
    }

    if (!result) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract media. Try again or use a different link.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Success via:', methodUsed);
    return new Response(JSON.stringify({
      success: true,
      data: { url, shortcode, type: mediaType, thumbnail: result.thumbnail, title: result.title, downloadUrl: result.downloadUrl || result.thumbnail, isVideo: result.isVideo, method: methodUsed },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Extraction error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Extraction failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
