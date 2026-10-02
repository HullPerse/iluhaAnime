import { useI18n } from "@/hooks/i18n.hook";

function EmptyPlayer() {
  const { t } = useI18n();

  return (
    <main className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
      <span className="windows95-font text-xs text-white">{t("player.media.empty.waiting")}</span>
    </main>
  );
}

export default EmptyPlayer;
