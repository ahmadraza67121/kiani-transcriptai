// Client-side transcript fetcher — runs in user's browser so YouTube won't block

interface CaptionSegment {
  text: string;
  start: number;
  dur: number;
}

function decodeHtmlEntities(text: string): string {
  const textarea = typeof document !== "undefined" ? document.createElement("textarea") : null;
  if (textarea) {
    textarea.innerHTML = text;
    return textarea.value.replace(/\n/g, " ");
  }
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/\\n/g, " ").replace(/\n/g, " ");
}

function parseTranscriptXml(xml: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  let match;

  // srv3 format
  const srv3Regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  while ((match = srv3Regex.exec(xml)) !== null) {
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) segments.push({ text, start: parseInt(match[1]) / 1000, dur: parseInt(match[2]) / 1000 });
  }
  if (segments.length > 0) return segments;

  // classic format
  const classicRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  while ((match = classicRegex.exec(xml)) !== null) {
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) segments.push({ text, start: parseFloat(match[1]), dur: parseFloat(match[2]) });
  }

  return segments;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Fetch via our proxy route (server fetches YouTube but via our API)
async function proxyFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: url }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.body || null;
  } catch {
    return null;
  }
}

// Method 1: InnerTube API via proxy
async function fetchViaInnerTube(videoId: string): Promise<CaptionSegment[] | null> {
  try {
    const res = await fetch("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `https://www.youtube.com/watch?v=${videoId}`,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const html = data.body;
    if (!html) return null;

    const playerMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/
    );
    if (!playerMatch) return null;

    const playerData = JSON.parse(playerMatch[1]);
    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) return null;

    const track =
      captions.find((c: { languageCode: string }) => c.languageCode === "en") ||
      captions.find((c: { languageCode: string }) => c.languageCode?.startsWith("en")) ||
      captions[0];

    const captionXml = await proxyFetch(track.baseUrl);
    if (!captionXml) return null;

    const segments = parseTranscriptXml(captionXml);
    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
}

// Method 2: Invidious instances
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.jing.rocks",
  "https://iv.ggtyler.dev",
  "https://invidious.protokolla.fi",
  "https://yt.cdaut.de",
  "https://invidious.privacyredirect.com",
];

async function fetchViaInvidious(videoId: string): Promise<CaptionSegment[] | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      // Direct fetch from browser — no CORS issue with Invidious APIs
      const res = await fetch(`${instance}/api/v1/captions/${videoId}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const captions = data?.captions;
      if (!captions || captions.length === 0) continue;

      const track =
        captions.find((c: { language_code: string }) => c.language_code === "en") ||
        captions.find((c: { language_code: string }) => c.language_code?.startsWith("en")) ||
        captions[0];

      if (!track?.label) continue;

      const captionUrl = `${instance}/api/v1/captions/${videoId}?label=${encodeURIComponent(track.label)}`;
      const captionRes = await fetch(captionUrl, { signal: AbortSignal.timeout(6000) });
      if (!captionRes.ok) continue;

      const xml = await captionRes.text();
      const segments = parseTranscriptXml(xml);
      if (segments.length > 0) return segments;
    } catch {
      continue;
    }
  }
  return null;
}

// Method 3: Free CORS proxies
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchViaCorsProxy(videoId: string): Promise<CaptionSegment[] | null> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  for (const makeProxyUrl of CORS_PROXIES) {
    try {
      const proxyUrl = makeProxyUrl(youtubeUrl);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;

      const html = await res.text();
      const playerMatch = html.match(
        /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/
      );
      if (!playerMatch) continue;

      const playerData = JSON.parse(playerMatch[1]);
      const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!captions || captions.length === 0) continue;

      const track =
        captions.find((c: { languageCode: string }) => c.languageCode === "en") ||
        captions.find((c: { languageCode: string }) => c.languageCode?.startsWith("en")) ||
        captions[0];

      const captionProxyUrl = makeProxyUrl(track.baseUrl);
      const captionRes = await fetch(captionProxyUrl, { signal: AbortSignal.timeout(10000) });
      if (!captionRes.ok) continue;

      const xml = await captionRes.text();
      const segments = parseTranscriptXml(xml);
      if (segments.length > 0) return segments;
    } catch {
      continue;
    }
  }
  return null;
}

// Main function — tries all methods
export async function fetchTranscript(videoId: string): Promise<{
  segments: { text: string; timestamp: string; offset: number; duration: number }[];
  fullText: string;
} | null> {
  let captionSegments: CaptionSegment[] | null = null;

  // 1. Invidious (direct from browser)
  captionSegments = await fetchViaInvidious(videoId);

  // 2. CORS proxies (from browser via proxy)
  if (!captionSegments) {
    captionSegments = await fetchViaCorsProxy(videoId);
  }

  // 3. Our server proxy
  if (!captionSegments) {
    captionSegments = await fetchViaInnerTube(videoId);
  }

  if (!captionSegments || captionSegments.length === 0) return null;

  const segments = captionSegments.map((seg) => ({
    text: seg.text,
    timestamp: formatTime(seg.start),
    offset: seg.start * 1000,
    duration: seg.dur * 1000,
  }));

  const fullText = captionSegments.map((s) => s.text).join(" ");

  return { segments, fullText };
}
