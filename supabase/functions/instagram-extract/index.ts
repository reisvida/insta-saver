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

function extractFromHTML(html: string): MediaResult | null {
  let thumbnail = '';
  let downloadUrl = '';
  let isVideo = false;
  let title = '';

  // OG meta tags (various attribute orders)
  const ogPatterns = [
    /property="og:image"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:image"/i,
    /name="og:image"\s+content="([^"]+)"/i,
    /property="og:image"\s*\/?\s*content="([^"]+)"/i,
  ];
  for (const p of ogPatterns) {
    const m = html.match(p);
    if (m) { thumbnail = m[1].replace(/&amp;/g, '&'); downloadUrl = thumbnail; break; }
  }

  const ogVideoPatterns = [
    /property="og:video(?::url|:secure_url)?"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:video(?::url|:secure_url)?"/i,
  ];
  for (const p of ogVideoPatterns) {
    const m = html.match(p);
    if (m) { downloadUrl = m[1].replace(/&amp;/g, '&'); isVideo = true; break; }
  }

  const titlePatterns = [
    /property="og:(?:title|description)"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:(?:title|description)"/i,
  ];
  for (const p of titlePatterns) {
    const m = html.match(p);
    if (m) { title = m[1]; break; }
  }

  // JSON-LD structured data
  if (!thumbnail) {
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (jsonLd) {
      try {
        const ld = JSON.parse(jsonLd[1]);
        if (ld.image) thumbnail = Array.isArray(ld.image) ? ld.image[0] : ld.image;
        if (ld.video?.contentUrl) { downloadUrl = ld.video.contentUrl; isVideo = true; }
        if (ld.name) title = ld.name;
        if (ld.description && !title) title = ld.description;
      } catch {}
    }
  }

  // Instagram-specific JSON in page source
  if (!isVideo) {
    const videoUrl = html.match(/"video_url"\s*:\s*"([^"]+)"/);
    if (videoUrl) { downloadUrl = videoUrl[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'); isVideo = true; }
  }
  if (!thumbnail) {
    const displayUrl = html.match(/"display_url"\s*:\s*"([^"]+)"/);
    if (displayUrl) { thumbnail = displayUrl[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'); if (!downloadUrl) downloadUrl = thumbnail; }
  }
  if (!thumbnail) {
    const thumbSrc = html.match(/"thumbnail_src"\s*:\s*"([^"]+)"/);
    if (thumbSrc) { thumbnail = thumbSrc[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'); if (!downloadUrl) downloadUrl = thumbnail; }
  }

  // Image src tags
  if (!thumbnail) {
    const imgSrc = html.match(/src="(https:\/\/(?:scontent|instagram)[^"]*\.(?:jpg|jpeg|png)[^"]*)"/i);
    if (imgSrc) { thumbnail = imgSrc[1].replace(/&amp;/g, '&'); if (!downloadUrl) downloadUrl = thumbnail; }
  }

  // Twitter card image
  if (!thumbnail) {
    const twImg = html.match(/name="twitter:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+name="twitter:image"/i);
    if (twImg) { thumbnail = twImg[1].replace(/&amp;/g, '&'); if (!downloadUrl) downloadUrl = thumbnail; }
  }

  if (!thumbnail && !downloadUrl) return null;
  return { thumbnail: thumbnail || downloadUrl, title: title.substring(0, 200), downloadUrl: downloadUrl || thumbnail, isVideo };
}

// Method 1: Direct page fetch with Facebook crawler UA
async function tryDirectFetch(url: string): Promise<MediaResult | null> {
  const userAgents = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Twitterbot/1.0',
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, 'Accept': 'text/html' },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const html = await res.text();
      console.log(`DirectFetch (${ua.substring(0, 20)}): HTML length ${html.length}`);
      const result = extractFromHTML(html);
      if (result) return result;
    } catch (e) {
      console.log(`DirectFetch failed for UA ${ua.substring(0, 20)}:`, e);
    }
  }
  return null;
}

// Method 2: Instagram embed endpoint
async function tryEmbed(url: string): Promise<MediaResult | null> {
  const shortcode = extractShortcode(url);
  if (!shortcode) return null;

  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const html = await res.text();
    console.log('Embed HTML length:', html.length);
    const result = extractFromHTML(html);
    if (result) return result;

    // Try finding image in specific embed patterns
    // Instagram embed uses background-image or img tags with scontent URLs
    const bgImg = html.match(/background-image:\s*url\(["']?(https:\/\/[^"')]+)["']?\)/i);
    if (bgImg) {
      const img = bgImg[1].replace(/&amp;/g, '&');
      return { thumbnail: img, title: '', downloadUrl: img, isVideo: false };
    }

    // Look for any scontent CDN URL
    const cdnUrl = html.match(/(https:\/\/scontent[^"'\s\\]+)/i);
    if (cdnUrl) {
      const img = cdnUrl[1].replace(/&amp;/g, '&');
      return { thumbnail: img, title: '', downloadUrl: img, isVideo: false };
    }

    return null;
  } catch (e) {
    console.log('Embed failed:', e);
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
      headers: {
        'x-rapidapi-host': host,
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) { console.log('RapidAPI error:', res.status); return null; }

    const raw = await res.json();
    console.log('RapidAPI response:', JSON.stringify(raw).substring(0, 300));
    if (raw.error) return null;

    const medias = raw.medias || raw.data?.medias || [];
    if (Array.isArray(medias) && medias.length > 0) {
      const videos = medias.filter((m: any) => m.type === 'video');
      const images = medias.filter((m: any) => m.type === 'image');
      const best = videos.length > 0 ? videos[0] : images[0] || medias[0];
      const thumbnail = raw.thumbnail || best.thumbnail || best.preview || '';
      const downloadUrl = best.url || best.download_url || '';
      if (downloadUrl || thumbnail) {
        return { thumbnail: thumbnail || downloadUrl, title: raw.title || '', downloadUrl: downloadUrl || thumbnail, isVideo: best.type === 'video' };
      }
    }
    return null;
  } catch (e) {
    console.log('RapidAPI failed:', e);
    return null;
  }
}

// Method 4: oEmbed
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
  } catch (e) {
    console.log('oEmbed failed:', e);
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
      return new Response(JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const shortcode = extractShortcode(url);
    const mediaType = detectType(url);
    let result: MediaResult | null = null;
    let methodUsed = '';

    const methods = [
      { name: 'DirectFetch', fn: () => tryDirectFetch(url) },
      { name: 'Embed', fn: () => tryEmbed(url) },
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
      data: { url, shortcode, type: mediaType, thumbnail: result.thumbnail, title: result.title.substring(0, 200), downloadUrl: result.downloadUrl || result.thumbnail, isVideo: result.isVideo, method: methodUsed },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Extraction error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Extraction failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
