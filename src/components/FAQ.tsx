import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export default function FAQ() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="w-full max-w-2xl mx-auto">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-8">
        {t.faq.title} <span className="gradient-text">{t.faq.titleHighlight}</span>
      </h2>
      <div className="space-y-3">
        {t.faq.items.map((faq, i) => (
          <div
            key={i}
            className="glass rounded-xl overflow-hidden cursor-pointer"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-medium text-foreground text-sm sm:text-base">{faq.q}</span>
              <motion.div animate={{ rotate: open === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
              </motion.div>
            </div>
            <AnimatePresence>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}
