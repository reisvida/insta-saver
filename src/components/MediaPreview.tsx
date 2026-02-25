import { motion } from "framer-motion";
import { Download, Image, Film, X } from "lucide-react";

type MediaResult = {
  url: string;
  type: string | null;
  thumbnail: string;
  downloadUrl: string;
};

export default function MediaPreview({ result, onClear }: { result: MediaResult; onClear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 200 }}
      className="w-full max-w-md mx-auto glass rounded-2xl overflow-hidden"
    >
      <div className="relative">
        <img
          src={result.thumbnail}
          alt="Preview da mídia"
          className="w-full aspect-square object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <button
          onClick={onClear}
          className="absolute top-3 right-3 bg-background/60 backdrop-blur-sm p-2 rounded-full text-foreground hover:bg-background/80 transition"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <span className="gradient-instagram text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
            {result.type === "Reel" || result.type === "IGTV" ? <Film className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
            {result.type}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground truncate">{result.url}</p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="w-full gradient-instagram text-primary-foreground font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 text-base"
        >
          <Download className="w-5 h-5" />
          Baixar em Alta Qualidade
        </motion.button>
      </div>
    </motion.div>
  );
}
