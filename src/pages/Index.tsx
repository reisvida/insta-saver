import { useState } from "react";
import { motion } from "framer-motion";
import DownloadInput from "@/components/DownloadInput";
import MediaPreview from "@/components/MediaPreview";
import Features from "@/components/Features";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import { Instagram } from "lucide-react";

const Index = () => {
  const [result, setResult] = useState<any>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-accent/6 blur-[100px] animate-pulse-glow" />
      </div>

      {/* Header */}
      <header className="relative z-10 container py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="gradient-instagram p-2 rounded-lg">
            <Instagram className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl gradient-text">InstaGrab</span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">Recursos</a>
          <a href="#faq" className="hover:text-foreground transition">FAQ</a>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1">
        <section className="container pt-16 pb-20 sm:pt-24 sm:pb-28 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-5">
              Baixe conteúdo do{" "}
              <span className="gradient-text">Instagram</span>
              {" "}em segundos
            </h1>
            <p className="text-muted-foreground text-lg sm:text-xl mb-10 max-w-xl mx-auto">
              Cole o link de qualquer post, reel ou story público e faça download em alta qualidade. Grátis e sem cadastro.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full"
          >
            {result ? (
              <MediaPreview result={result} onClear={() => setResult(null)} />
            ) : (
              <DownloadInput onResult={setResult} />
            )}
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-4 mt-8 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              100% Gratuito
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Sem Cadastro
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Alta Qualidade
            </span>
          </motion.div>
        </section>

        {/* Features */}
        <section id="features" className="container pb-20">
          <Features />
        </section>

        {/* FAQ */}
        <section id="faq" className="container pb-20">
          <FAQ />
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
