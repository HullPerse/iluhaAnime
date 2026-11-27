import { ignore } from "@/lib/core/shared/promise.utils";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { readAudioDevices } from "@/lib/player/audioDevice.utils";
import { Row } from "@/routes/components/player/media/settings/row.settings";

export default function AudioDevice({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const devices = useQuery({
    queryKey: ["player", "audio-devices"],
    queryFn: readAudioDevices,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const options = [
    { value: "auto", label: t("player.media.settings.audioDevice.auto") },
    ...(devices.data ?? [])
      .filter((device) => device.name !== "auto")
      .map((device) => ({ value: device.name, label: device.description || device.name })),
  ];
  const missing = value !== "auto" && !options.some((option) => option.value === value);

  if (missing) options.push({ value, label: t("player.media.settings.audioDevice.missing") });

  return (
    <Row label={t("player.media.settings.audioDevice")}>
      <Select
        label={t("player.media.settings.audioDevice")}
        value={value}
        options={options}
        disabled={devices.isLoading || devices.isError}
        onChange={onChange}
      />
      <Button
        onClick={() => {
          ignore(devices.refetch());
        }}
        disabled={devices.isFetching}
      >
        {t("player.media.settings.audioDevice.refresh")}
      </Button>
      {devices.isError && <span role="alert">{t("player.media.settings.audioDevice.error")}</span>}
    </Row>
  );
}
