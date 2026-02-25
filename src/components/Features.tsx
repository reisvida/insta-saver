import { Download, Image, Film, Smartphone } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  { icon: Image, title: "Posts & Carrosséis", desc: "Baixe fotos e carrosséis em resolução original" },
  { icon: Film, title: "Reels & Vídeos", desc: "Download de Reels e IGTV em qualidade HD" },
  { icon: Smartphone, title: "Stories", desc: "Salve stories públicos antes que expirem" },
  { icon: Download, title: "Alta Qualidade", desc: "Sempre a melhor resolução disponível" },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Features() {
  return (
    <section className="w-full max-w-3xl mx-auto">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-8">
        O que você pode <span className="gradient-text">baixar</span>
      </h2>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            className="glass rounded-xl p-5 text-center hover:glow-primary transition-shadow duration-300"
          >
            <div className="gradient-instagram w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3">
              <f.icon className="w-6 h-6 text-primary-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
