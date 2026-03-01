import { useLanguage } from "@/i18n/LanguageContext";
import { Locale } from "@/i18n/translations";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const localeLabels: Record<Locale, string> = {
  pt: "PT",
  en: "EN",
  es: "ES",
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center gap-1.5">
      <Globe className="w-4 h-4 text-muted-foreground" />
      <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
        <SelectTrigger className="w-[65px] h-8 text-xs border-border bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(localeLabels) as Locale[]).map((l) => (
            <SelectItem key={l} value={l} className="text-xs">
              {localeLabels[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
