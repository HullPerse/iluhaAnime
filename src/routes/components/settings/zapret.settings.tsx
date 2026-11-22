import { ZAPRET_ALL_IPS, ZAPRET_HOSTLIST, ZAPRET_SAFE_IPS } from "@/config/settings/zapret.config";
import { useI18n } from "@/hooks/i18n.hook";
import { CopyList } from "@/routes/components/settings/zapret/copyList.zapret";
import { LocalEndpoint } from "@/routes/components/settings/zapret/localEndpoint.zapret";

export default function SettingsZapret() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      <CopyList
        sectionId="zapret.hostlist"
        title={t("settings.zapret.hostlist.title")}
        value={ZAPRET_HOSTLIST.join("\n")}
      />

      <CopyList
        sectionId="zapret.safe"
        title={t("settings.zapret.safe.title")}
        value={ZAPRET_SAFE_IPS.join("\n")}
      />

      <CopyList
        sectionId="zapret.all"
        title={t("settings.zapret.all.title")}
        value={ZAPRET_ALL_IPS.join("\n")}
      />

      <LocalEndpoint />
    </div>
  );
}
