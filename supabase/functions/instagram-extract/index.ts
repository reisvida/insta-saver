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

// Method 1: Instagram GraphQL API (No cookie needed)
async function tryGraphQL(url: string): Promise<MediaResult | null> {
  const shortcode = extractShortcode(url);
  if (!shortcode) return null;

  try {
    const graphqlUrl = new URL('https://www.instagram.com/api/graphql');
    const params = new URLSearchParams();
    params.set('variables', JSON.stringify({ shortcode }));
    params.set('doc_id', '10015901848480474');
    params.set('lsd', 'AVqbxe3J_YA');

    const res = await fetch(graphqlUrl.toString(), {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': '936619743392459',
        'X-FB-LSD': 'AVqbxe3J_YA',
        'X-ASBD-ID': '129477',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: params.toString(),
    });

    console.log('GraphQL status:', res.status);
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      console.log('GraphQL: non-JSON response');
      return null;
    }

    const json = await res.json();
    const media = json?.data?.xdt_shortcode_media;
    if (!media) {
      console.log('GraphQL: no xdt_shortcode_media found');
      return null;
    }

    const isVideo = media.is_video || false;
    const thumbnail = media.display_url || media.thumbnail_src || '';
    const downloadUrl = isVideo ? (media.video_url || thumbnail) : thumbnail;
    const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';

    if (thumbnail || downloadUrl) {
      console.log('GraphQL: found media, isVideo:', isVideo);
      return { thumbnail: thumbnail || downloadUrl, title: caption.substring(0, 200), downloadUrl: downloadUrl || thumbnail, isVideo };
    }
    return null;
  } catch (e) {
    console.log('GraphQL failed:', e);
    return null;
  }
}

// Method 2: RapidAPI Social Download All In One
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
    if (raw.error) { console.log('RapidAPI error:', raw.message); return null; }

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

// Method 3: oEmbed (thumbnail only fallback)
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
      { name: 'GraphQL', fn: () => tryGraphQL(url) },
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
