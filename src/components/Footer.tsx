import { useLanguage } from "@/i18n/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="w-full border-t border-border py-8 mt-12">
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="gradient-text font-display font-bold text-lg">InstaGrab</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground transition">{t.footer.terms}</a>
          <a href="#" className="hover:text-foreground transition">{t.footer.privacy}</a>
          <a href="#" className="hover:text-foreground transition">{t.footer.contact}</a>
        </div>
      </div>
    </footer>
  );
}
