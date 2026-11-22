import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsRoute } from "@/routes/__root.defs";

export function DiagnosticButton({ probe }: { probe: string | undefined }) {
  const { t } = useI18n();
  const navigate = settingsRoute.useNavigate();

  if (probe === undefined) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-6 px-2 text-xs"
      onClick={() => navigate({ search: { tab: "diagnostics", probe } })}
    >
      {t("settings.proxy.test.diagnostics")}
    </Button>
  );
}
