"use client";

import { useState, useEffect } from "react";
import { fetchTranscript } from "@/lib/transcript-client";

interface TranscriptSegment {
  text: string;
  timestamp: string;
  offset: number;
  duration: number;
}

interface HistoryItem {
  id: number;
  videoId: string;
  videoUrl: string;
  videoTitle: string | null;
  originalLang: string | null;
  createdAt: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const LANGUAGES = [
  { code: "roman-ur", name: "Roman Urdu (رومن اردو)", flag: "🇵🇰", special: true },
  { code: "hinglish", name: "Hinglish (हिंग्लिश)", flag: "🇮🇳", special: true },
  { code: "ur", name: "اردو (Urdu)", flag: "🇵🇰" },
  { code: "hi", name: "हिन्दी (Hindi)", flag: "🇮🇳" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "ar", name: "العربية (Arabic)", flag: "🇸🇦" },
  { code: "es", name: "Español (Spanish)", flag: "🇪🇸" },
  { code: "fr", name: "Français (French)", flag: "🇫🇷" },
  { code: "de", name: "Deutsch (German)", flag: "🇩🇪" },
  { code: "zh", name: "中文 (Chinese)", flag: "🇨🇳" },
  { code: "ja", name: "日本語 (Japanese)", flag: "🇯🇵" },
  { code: "ko", name: "한국어 (Korean)", flag: "🇰🇷" },
  { code: "pt", name: "Português (Portuguese)", flag: "🇧🇷" },
  { code: "ru", name: "Русский (Russian)", flag: "🇷🇺" },
  { code: "tr", name: "Türkçe (Turkish)", flag: "🇹🇷" },
  { code: "it", name: "Italiano (Italian)", flag: "🇮🇹" },
  { code: "nl", name: "Nederlands (Dutch)", flag: "🇳🇱" },
  { code: "pl", name: "Polski (Polish)", flag: "🇵🇱" },
  { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "th", name: "ไทย (Thai)", flag: "🇹🇭" },
  { code: "vi", name: "Tiếng Việt (Vietnamese)", flag: "🇻🇳" },
  { code: "bn", name: "বাংলা (Bengali)", flag: "🇧🇩" },
  { code: "fa", name: "فارسی (Persian)", flag: "🇮🇷" },
  { code: "pa", name: "ਪੰਜਾਬੀ (Punjabi)", flag: "🇮🇳" },
  { code: "ms", name: "Bahasa Melayu (Malay)", flag: "🇲🇾" },
  { code: "sw", name: "Kiswahili (Swahili)", flag: "🇰🇪" },
];

const REWRITE_STYLES = [
  { code: "professional", name: "Professional", icon: "💼", description: "Formal business style" },
  { code: "casual", name: "Casual/Friendly", icon: "😊", description: "Conversational tone" },
  { code: "simple", name: "Simple/Easy", icon: "📖", description: "Easy to understand" },
  { code: "creative", name: "Creative", icon: "✨", description: "Engaging storytelling" },
  { code: "concise", name: "Concise/Short", icon: "⚡", description: "Brief and to the point" },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [fullText, setFullText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [rewrittenText, setRewrittenText] = useState("");
  const [selectedLang, setSelectedLang] = useState("roman-ur");
  const [selectedStyle, setSelectedStyle] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState("");
  const [videoId, setVideoId] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedTranslation, setCopiedTranslation] = useState(false);
  const [copiedRewrite, setCopiedRewrite] = useState(false);
  const [viewMode, setViewMode] = useState<"timestamps" | "full">("timestamps");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rewriteSource, setRewriteSource] = useState<"original" | "translated">("translated");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  const extractVideoId = (inputUrl: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = inputUrl.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleFetchTranscript = async () => {
    if (!url.trim()) {
      setError("Please enter a YouTube video URL");
      return;
    }

    const vid = extractVideoId(url.trim());
    if (!vid) {
      setError("Invalid YouTube URL. Sahi YouTube video link daalein.");
      return;
    }

    setLoading(true);
    setError("");
    setSegments([]);
    setFullText("");
    setTranslatedText("");
    setRewrittenText("");
    setVideoId("");

    try {
      // Client-side transcript fetching — YouTube won't block browser!
      const result = await fetchTranscript(vid);

      if (!result) {
        setError("Is video ka transcript available nahi hai. Video mein subtitles/captions enabled nahi hain. Doosri video try karein.");
        return;
      }

      setSegments(result.segments);
      setFullText(result.fullText);
      setVideoId(vid);

      // Save to server (optional)
      fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), segments: result.segments, fullText: result.fullText }),
      }).catch(() => {});
    } catch {
      setError("Network error. Connection check karein aur dubara try karein.");
    } finally {
      setLoading(false);
    }
  };

  const translateTranscript = async () => {
    if (!fullText) return;

    setTranslating(true);
    setTranslatedText("");
    setRewrittenText("");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText, targetLang: selectedLang }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Translation failed");
        return;
      }

      setTranslatedText(data.translatedText);
    } catch {
      setError("Translation failed. Please try again.");
    } finally {
      setTranslating(false);
    }
  };

  const rewriteScript = async () => {
    const sourceText = rewriteSource === "translated" ? translatedText : fullText;
    const sourceLang = rewriteSource === "translated" ? selectedLang : "en";

    if (!sourceText) {
      setError("Please translate or have transcript text first");
      return;
    }

    setRewriting(true);
    setRewrittenText("");

    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText, style: selectedStyle, targetLang: sourceLang }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Rewriting failed");
        return;
      }

      setRewrittenText(data.rewrittenText);
    } catch {
      setError("Rewriting failed. Please try again.");
    } finally {
      setRewriting(false);
    }
  };

  const copyToClipboard = async (text: string, type: "original" | "translation" | "rewrite") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "translation") {
        setCopiedTranslation(true);
        setTimeout(() => setCopiedTranslation(false), 2000);
      } else if (type === "rewrite") {
        setCopiedRewrite(true);
        setTimeout(() => setCopiedRewrite(false), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  const downloadTranscript = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (data.success) setHistory(data.history);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    if (!showHistory) loadHistory();
    setShowHistory(!showHistory);
  };

  const selectedLangName = LANGUAGES.find((l) => l.code === selectedLang)?.name || selectedLang;
  const selectedStyleName = REWRITE_STYLES.find((s) => s.code === selectedStyle)?.name || selectedStyle;
  const isRTL = ["ar", "ur", "fa"].includes(selectedLang);
  const rewriteLang = rewriteSource === "translated" ? selectedLang : "en";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Install Banner */}
      {showInstallBanner && isInstallable && !isInstalled && (
        <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📲</span>
              <div>
                <p className="font-semibold text-sm">Install Kiani TranscriptAI App!</p>
                <p className="text-xs opacity-90">Desktop par install karein for faster access</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleInstallClick} className="px-4 py-2 bg-white text-red-600 font-semibold rounded-lg text-sm hover:bg-slate-100 transition-all">
                Install Now
              </button>
              <button onClick={() => setShowInstallBanner(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-950/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Kiani Transcript<span className="text-red-400">AI</span></h1>
                <p className="text-xs text-slate-400">Extract • Translate • Rewrite</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isInstallable && !isInstalled && (
                <button onClick={handleInstallClick} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white text-sm font-medium transition-all shadow-lg shadow-red-500/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Install App
                </button>
              )}
              {isInstalled && (
                <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Installed
                </span>
              )}
              <button onClick={toggleHistory} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white transition-all text-sm border border-slate-700/50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">History</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            YouTube Video ka <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">Transcript</span> Nikaalein
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Koi bhi YouTube video ka transcript nikaalein, Roman Urdu/Hinglish mein translate karein, aur naye words mein rewrite karein
          </p>
        </div>

        {/* URL Input Section */}
        <div className="max-w-3xl mx-auto mb-10">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-500/20 via-orange-500/20 to-red-500/20 rounded-2xl blur-lg group-hover:blur-xl transition-all opacity-75 animate-gradient" />
            <div className="relative bg-slate-900 rounded-2xl p-6 border border-slate-800">
              <label className="block text-sm font-medium text-slate-300 mb-3">🔗 YouTube Video URL Paste Karein</label>
              <div className="flex gap-3 flex-col sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleFetchTranscript()}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all text-sm"
                  />
                  {url && (
                    <button onClick={() => { setUrl(""); setError(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button onClick={handleFetchTranscript} disabled={loading} className="px-6 py-3.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 min-w-[180px]">
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Extracting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Transcript Nikaalein
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="max-w-5xl mx-auto">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <div className="shimmer h-6 w-48 rounded mb-6" />
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="shimmer h-5 w-14 rounded" />
                    <div className="shimmer h-5 flex-1 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Video Preview + Transcript */}
        {videoId && segments.length > 0 && !loading && (
          <div className="max-w-5xl mx-auto animate-fade-in">
            {/* Video Embed */}
            <div className="mb-6">
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div className="aspect-video w-full max-w-2xl mx-auto">
                  <iframe src={`https://www.youtube.com/embed/${videoId}`} title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
                </div>
              </div>
            </div>

            {/* Transcript Section */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Original Transcript</h3>
                    <p className="text-xs text-slate-400">{segments.length} segments found</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex bg-slate-800 rounded-lg p-0.5">
                    <button onClick={() => setViewMode("timestamps")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "timestamps" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-300"}`}>Timestamps</button>
                    <button onClick={() => setViewMode("full")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "full" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-300"}`}>Full Text</button>
                  </div>
                  <button onClick={() => copyToClipboard(fullText, "original")} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition-all">
                    {copied ? (<><svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>)}
                  </button>
                  <button onClick={() => downloadTranscript(fullText, `transcript-${videoId}.txt`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Download
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                {viewMode === "timestamps" ? (
                  <div className="space-y-1">
                    {segments.map((segment, index) => (
                      <div key={index} className="flex gap-3 items-start py-1.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors group">
                        <span className="text-xs font-mono text-red-400/80 bg-red-500/5 px-2 py-0.5 rounded shrink-0 mt-0.5 min-w-[50px] text-center">{segment.timestamp}</span>
                        <p className="text-sm text-slate-300 leading-relaxed group-hover:text-slate-200">{segment.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{fullText}</p>
                )}
              </div>
            </div>

            {/* Translation Section */}
            <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Language Translate Karein</h3>
                    <p className="text-xs text-slate-400">Roman Urdu, Hinglish ya kisi bhi language mein convert karein</p>
                  </div>
                </div>

                <div className="flex gap-3 flex-col sm:flex-row">
                  <div className="relative flex-1">
                    <select value={selectedLang} onChange={(e) => setSelectedLang(e.target.value)} className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm appearance-none cursor-pointer">
                      <optgroup label="⭐ Popular">
                        {LANGUAGES.filter(l => l.special).map((lang) => (<option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>))}
                      </optgroup>
                      <optgroup label="🌍 All Languages">
                        {LANGUAGES.filter(l => !l.special).map((lang) => (<option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>))}
                      </optgroup>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  <button onClick={translateTranscript} disabled={translating || !fullText} className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 min-w-[180px]">
                    {translating ? (<><svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Translating...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>Translate Karein</>)}
                  </button>
                </div>
              </div>

              {translating && (
                <div className="p-6">
                  <div className="space-y-3">{[...Array(5)].map((_, i) => (<div key={i} className="shimmer h-4 rounded" style={{ width: `${85 - i * 10}%` }} />))}</div>
                </div>
              )}

              {translatedText && !translating && (
                <div className="animate-fade-in">
                  <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">Translated to:</span>
                      <span className="text-sm font-medium text-blue-400">{selectedLangName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyToClipboard(translatedText, "translation")} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition-all">
                        {copiedTranslation ? (<><svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>)}
                      </button>
                      <button onClick={() => downloadTranscript(translatedText, `translated-${videoId}-${selectedLang}.txt`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Download
                      </button>
                    </div>
                  </div>
                  <div className="p-4 sm:p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap" dir={isRTL ? "rtl" : "ltr"}>{translatedText}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Rewrite Section */}
            <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Script Rewrite Karein ✨</h3>
                    <p className="text-xs text-slate-400">Naye words mein rewrite karein different styles mein</p>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-2">Kaunsa text rewrite karna hai?</label>
                  <div className="flex gap-2">
                    <button onClick={() => setRewriteSource("translated")} disabled={!translatedText} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${rewriteSource === "translated" ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-300"} ${!translatedText ? "opacity-50 cursor-not-allowed" : ""}`}>🌐 Translated Text</button>
                    <button onClick={() => setRewriteSource("original")} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${rewriteSource === "original" ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-300"}`}>📝 Original Transcript</button>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-2">Rewrite Style Select Karein</label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {REWRITE_STYLES.map((style) => (
                      <button key={style.code} onClick={() => setSelectedStyle(style.code)} className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all border flex flex-col items-center gap-1 ${selectedStyle === style.code ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600"}`}>
                        <span className="text-lg">{style.icon}</span>
                        <span>{style.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={rewriteScript} disabled={rewriting || (!translatedText && rewriteSource === "translated") || (!fullText && rewriteSource === "original")} className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20">
                  {rewriting ? (<><svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Rewriting...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>Script Rewrite Karein</>)}
                </button>
              </div>

              {rewriting && (
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="animate-pulse flex items-center gap-2">
                      <span className="text-2xl">✨</span>
                      <span className="text-sm text-purple-400">Script rewrite ho raha hai...</span>
                    </div>
                  </div>
                  <div className="space-y-3">{[...Array(5)].map((_, i) => (<div key={i} className="shimmer h-4 rounded" style={{ width: `${90 - i * 8}%` }} />))}</div>
                </div>
              )}

              {rewrittenText && !rewriting && (
                <div className="animate-fade-in">
                  <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-400">Rewritten in:</span>
                      <span className="text-sm font-medium text-purple-400">{selectedStyleName} style</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyToClipboard(rewrittenText, "rewrite")} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition-all">
                        {copiedRewrite ? (<><svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>)}
                      </button>
                      <button onClick={() => downloadTranscript(rewrittenText, `rewritten-${videoId}-${selectedStyle}.txt`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Download
                      </button>
                    </div>
                  </div>
                  <div className="p-4 sm:p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap" dir={["ar", "ur", "fa"].includes(rewriteLang) ? "rtl" : "ltr"}>{rewrittenText}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !videoId && (
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center">
              <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Koi Video Select Karein</h3>
            <p className="text-sm text-slate-500 mb-8">YouTube video ka link upar paste karein aur transcript extract karein</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h4 className="text-sm font-medium text-white mb-1">Fast Extraction</h4>
                <p className="text-xs text-slate-500">Kisi bhi video ka transcript seconds mein nikaalein</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                </div>
                <h4 className="text-sm font-medium text-white mb-1">Roman Urdu & Hinglish</h4>
                <p className="text-xs text-slate-500">Special support for Roman Urdu/Hinglish + 24 more</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </div>
                <h4 className="text-sm font-medium text-white mb-1">AI Rewrite</h4>
                <p className="text-xs text-slate-500">Script ko naye words mein rewrite karein</p>
              </div>
            </div>

            {isInstallable && !isInstalled && (
              <div className="mt-10 p-6 rounded-2xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="text-center sm:text-left">
                    <h4 className="text-white font-semibold mb-1">📲 Desktop App Install Karein!</h4>
                    <p className="text-sm text-slate-400">Browser band karke bhi use karein native app jaisa</p>
                  </div>
                  <button onClick={handleInstallClick} className="px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-500/20 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Install App
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Panel */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-start justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={toggleHistory} />
            <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 overflow-y-auto animate-fade-in">
              <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
                <h3 className="text-lg font-semibold text-white">Recent History</h3>
                <button onClick={toggleHistory} className="text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4">
                {historyLoading ? (
                  <div className="space-y-3">{[...Array(5)].map((_, i) => (<div key={i} className="shimmer h-16 rounded-lg" />))}</div>
                ) : history.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No history yet</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((item) => (
                      <button key={item.id} onClick={() => { setUrl(item.videoUrl); setShowHistory(false); }} className="w-full text-left p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-10 rounded bg-slate-700 overflow-hidden shrink-0">
                            <img src={`https://img.youtube.com/vi/${item.videoId}/default.jpg`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs text-slate-300 truncate">{item.videoUrl}</p>
                            <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <p className="text-xs text-slate-600">Kiani TranscriptAI — Extract • Translate • Rewrite YouTube Transcripts</p>
          <p className="text-xs text-slate-700 mt-1">💡 Tip: Install Kiani TranscriptAI as desktop app for offline access</p>
        </div>
      </footer>
    </div>
  );
}
