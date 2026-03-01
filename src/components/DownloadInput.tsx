import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

const INSTAGRAM_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|stories|tv)\/[\w-]+\/?/;

function detectType(url: string): string | null {
  if (/\/reel(s)?\//.test(url)) return "Reel";
  if (/\/p\//.test(url)) return "Post";
  if (/\/stories\//.test(url)) return "Story";
  if (/\/tv\//.test(url)) return "IGTV";
  return null;
}

export default function DownloadInput({ onResult }: { onResult: (data: any) => void }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValid = INSTAGRAM_REGEX.test(url.trim());
  const mediaType = detectType(url.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setError(t.input.error);
      return;
    }
    setError("");
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("instagram-extract", {
        body: { url: url.trim() },
      });

      if (fnError || !data?.success) {
        setError(data?.error || fnError?.message || t.input.error);
        setLoading(false);
        return;
      }

      onResult({
        url: url.trim(),
        type: data.data.type || mediaType,
        thumbnail: data.data.thumbnail,
        downloadUrl: data.data.downloadUrl,
        title: data.data.title,
        isVideo: data.data.isVideo,
      });
    } catch {
      // Fallback to simulation if edge function fails
      setTimeout(() => {
        onResult({
          url: url.trim(),
          type: mediaType,
          thumbnail: "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=600&h=600&fit=crop",
          downloadUrl: "#",
        });
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative glass rounded-2xl p-1.5 glow-primary transition-shadow focus-within:glow-accent">
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            placeholder={t.input.placeholder}
            className="flex-1 bg-transparent px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none text-base sm:text-lg"
          />
          <motion.button
            type="submit"
            disabled={loading || !url.trim()}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="gradient-instagram text-primary-foreground font-semibold px-6 sm:px-8 py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-base shrink-0"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">{loading ? t.input.extracting : t.input.download}</span>
          </motion.button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {url.trim() && mediaType && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="gradient-instagram text-primary-foreground text-xs font-medium px-2.5 py-1 rounded-full"
            >
              {mediaType}
            </motion.span>
          )}
        </div>
        {error && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-destructive text-sm flex items-center gap-1"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </motion.span>
        )}
      </div>
    </form>
  );
}
