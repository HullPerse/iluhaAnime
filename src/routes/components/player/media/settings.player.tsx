import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import {
  CRT_CURVATURE_LABELS,
  CRT_CURVATURES,
  PLAYER_CABINET_IDS,
  PLAYER_CABINETS,
  PLAYER_MODE_IDS,
  PLAYER_MODES,
} from "@/config/settings/modes.config";
import { PLAYER_PROFILE_IDS } from "@/config/settings/profiles.config";
import { PLAYER_FONT_OPTIONS } from "@/config/player/fonts.config";
import { useI18n } from "@/hooks/i18n.hook";
import { DEFAULT_PLAYER_SETTINGS } from "@/store/player.store";
import type {
  CrtCurvature,
  EndOfFileMode,
  HwdecMode,
  PlayerCabinetId,
  PlayerModeId,
  PlayerProfileId,
  PlayerSettings,
  SeekMode,
} from "@/types/player/videoPlayer";

import PlayerSlider from "@/routes/components/player/media/slider.player";

import { Section } from "@/routes/components/player/media/settings/section.settings";
import { Row } from "@/routes/components/player/media/settings/row.settings";
import { ColorInput } from "@/routes/components/player/media/settings/colorInput.settings";

function SettingsPanel({
  settings,
  hwdec,
  seekMode,
  eofMode,
  autoHide,
  profile,
  streaming,
  onPatchSettings,
  onHwdec,
  onSeekMode,
  onEofMode,
  onAutoHide,
  onProfile,
}: {
  settings: PlayerSettings;
  hwdec: HwdecMode;
  seekMode: SeekMode;
  eofMode: EndOfFileMode;
  autoHide: boolean;
  profile: PlayerProfileId;
  /** A stream ignores the local cache profile, so the control is hidden. */
  streaming: boolean;
  onPatchSettings: (patch: Partial<PlayerSettings>) => void;
  onHwdec: (mode: HwdecMode) => void;
  onSeekMode: (mode: SeekMode) => void;
  onEofMode: (mode: EndOfFileMode) => void;
  onAutoHide: (autoHide: boolean) => void;
  onProfile: (profile: PlayerProfileId) => void;
}) {
  const { t } = useI18n();
  const fontOptions = PLAYER_FONT_OPTIONS.map((font) => ({ value: font, label: font }));
  const hwdecOptions = [
    { value: "auto-safe", label: t("player.media.settings.hwdec.auto.safe") },
    { value: "d3d11va", label: t("player.media.settings.hwdec.d3d11va") },
    { value: "cuda", label: t("player.media.settings.hwdec.cuda") },
    { value: "no", label: t("player.media.settings.hwdec.no") },
  ];
  const seekOptions = [
    { value: "keyframes", label: t("player.media.settings.seek.keyframes") },
    { value: "exact", label: t("player.media.settings.seek.exact") },
  ];
  const eofOptions = [
    { value: "none", label: t("player.media.eof.none") },
    { value: "pause", label: t("player.media.eof.pause") },
    { value: "next", label: t("player.media.eof.next") },
    { value: "repeat", label: t("player.media.eof.repeat") },
  ];
  const profileOptions = PLAYER_PROFILE_IDS.map((id) => ({
    value: id,
    label: t(`player.media.settings.profile.${id}` as const),
  }));
  const tonemapOptions = [
    { value: "auto", label: t("player.media.settings.tonemap.auto") },
    { value: "manual", label: t("player.media.settings.tonemap.manual") },
  ];
  const primOptions = ["auto", "bt.709", "bt.2020", "dci-p3", "display-p3"].map((value) => ({
    value,
    label: value,
  }));
  const trcOptions = ["auto", "bt.1886", "srgb", "linear", "gamma2.2", "pq", "hlg"].map(
    (value) => ({ value, label: value })
  );
  const modeOptions = PLAYER_MODE_IDS.map((id) => ({
    value: id,
    label: t(PLAYER_MODES[id].labelKey),
  }));
  const cabinetOptions = PLAYER_CABINET_IDS.map((id) => ({
    value: id,
    label: t(PLAYER_CABINETS[id]),
  }));
  const curvatureOptions = CRT_CURVATURES.map((value) => ({
    value: String(value),
    label: t(CRT_CURVATURE_LABELS[value]),
  }));
  const modeDef = PLAYER_MODES[settings.playerMode];

  return (
    <div className="flex w-full flex-col gap-2">
      <Section title={t("player.media.settings.screen")}>
        <Row label={t("player.media.settings.mode")}>
          <Select
            className="flex-1"
            label={t("player.media.settings.mode")}
            value={settings.playerMode}
            options={modeOptions}
            onChange={(value) => onPatchSettings({ playerMode: value as PlayerModeId })}
          />
        </Row>
        <Row label={t("player.media.settings.cabinet")}>
          <Select
            className="flex-1"
            label={t("player.media.settings.cabinet")}
            value={settings.cabinet}
            options={cabinetOptions}
            onChange={(value) => onPatchSettings({ cabinet: value as PlayerCabinetId })}
          />
        </Row>
        {modeDef.curvatureEditable && (
          <Row label={t("player.media.settings.curvature")}>
            <Select
              className="flex-1"
              label={t("player.media.settings.curvature")}
              value={String(settings.crtCurvature)}
              options={curvatureOptions}
              onChange={(value) => onPatchSettings({ crtCurvature: Number(value) as CrtCurvature })}
            />
          </Row>
        )}
      </Section>
      <Section title={t("player.media.settings.playback")}>
        <Row label={t("player.media.settings.hwdec")}>
          <Select
            className="flex-1"
            value={hwdec}
            options={hwdecOptions}
            onChange={(value) => onHwdec(value as HwdecMode)}
          />
        </Row>
        <Row label={t("player.media.settings.seek")}>
          <Select
            className="flex-1"
            value={seekMode}
            options={seekOptions}
            onChange={(value) => onSeekMode(value as SeekMode)}
          />
        </Row>
        <Row label={t("player.media.settings.eof")}>
          <Select
            className="flex-1"
            value={eofMode}
            options={eofOptions}
            onChange={(value) => onEofMode(value as EndOfFileMode)}
          />
        </Row>
        <Row label={t("player.media.settings.autohide")}>
          <Checkbox
            checked={autoHide}
            onChange={onAutoHide}
            aria-label={t("player.media.settings.autohide")}
          />
        </Row>
        {!streaming && (
          <Row label={t("player.media.settings.profile")}>
            <Select
              className="flex-1"
              value={profile}
              options={profileOptions}
              onChange={(value) => onProfile(value as PlayerProfileId)}
            />
          </Row>
        )}
      </Section>
      <Section title={t("player.media.settings.filters")}>
        <PlayerSlider
          label={t("player.media.settings.brightness")}
          min={0}
          max={200}
          step={1}
          value={settings.brightness}
          format={(value) => `${value}%`}
          onChange={(value) => onPatchSettings({ brightness: value })}
        />
        <PlayerSlider
          label={t("player.media.settings.contrast")}
          min={0}
          max={200}
          step={1}
          value={settings.contrast}
          format={(value) => `${value}%`}
          onChange={(value) => onPatchSettings({ contrast: value })}
        />
        <PlayerSlider
          label={t("player.media.settings.saturation")}
          min={0}
          max={200}
          step={1}
          value={settings.saturation}
          format={(value) => `${value}%`}
          onChange={(value) => onPatchSettings({ saturation: value })}
        />
        <PlayerSlider
          label={t("player.media.settings.hue")}
          min={-100}
          max={100}
          step={1}
          value={settings.hue}
          format={(value) => `${value}`}
          onChange={(value) => onPatchSettings({ hue: value })}
        />
      </Section>
      <Section title={t("player.media.settings.image")}>
        <Row label={t("player.media.settings.target.prim")}>
          <Select
            className="flex-1"
            value={settings.targetPrim}
            options={primOptions}
            onChange={(value) =>
              onPatchSettings({ targetPrim: value as PlayerSettings["targetPrim"] })
            }
          />
        </Row>
        <Row label={t("player.media.settings.target.trc")}>
          <Select
            className="flex-1"
            value={settings.targetTrc}
            options={trcOptions}
            onChange={(value) =>
              onPatchSettings({ targetTrc: value as PlayerSettings["targetTrc"] })
            }
          />
        </Row>
        <Row label={t("player.media.settings.tonemap")}>
          <Select
            className="flex-1"
            value={settings.toneMap}
            options={tonemapOptions}
            onChange={(value) => onPatchSettings({ toneMap: value as PlayerSettings["toneMap"] })}
          />
        </Row>
        {settings.toneMap === "manual" && (
          <>
            <PlayerSlider
              label={t("player.media.settings.target.peak")}
              min={100}
              max={10_000}
              step={50}
              value={settings.targetPeak}
              format={(value) => `${Math.round(value)} nits`}
              onChange={(value) => onPatchSettings({ targetPeak: value })}
            />
            <Row label={t("player.media.settings.hdr.compute.peak")}>
              <Checkbox
                checked={settings.hdrComputePeak}
                onChange={(value) => onPatchSettings({ hdrComputePeak: value })}
                aria-label={t("player.media.settings.hdr.compute.peak")}
              />
            </Row>
          </>
        )}
      </Section>
      <Section title={t("player.media.settings.audio")}>
        <Row label={t("player.media.settings.loudnorm")}>
          <Checkbox
            checked={settings.loudnorm}
            onChange={(value) => onPatchSettings({ loudnorm: value })}
            aria-label={t("player.media.settings.loudnorm")}
          />
        </Row>
      </Section>
      <Section title={t("player.media.settings.subtitles")}>
        <PlayerSlider
          label={t("player.media.subtitles.size")}
          min={10}
          max={48}
          step={1}
          value={settings.subFontSize}
          format={(value) => `${value}px`}
          onChange={(value) => onPatchSettings({ subFontSize: value })}
        />
        <Row label={t("player.media.subtitles.font")}>
          <Select
            className="flex-1"
            value={settings.subFontFamily}
            options={fontOptions}
            onChange={(value) => onPatchSettings({ subFontFamily: value })}
          />
        </Row>
        <Row label={t("player.media.subtitles.color")}>
          <ColorInput
            value={settings.subColor}
            onChange={(value) => onPatchSettings({ subColor: value })}
          />
        </Row>
        <Row label={t("player.media.subtitles.background")}>
          <ColorInput
            value={settings.subBgColor}
            onChange={(value) => onPatchSettings({ subBgColor: value })}
          />
        </Row>
        <PlayerSlider
          label={t("player.media.subtitles.background.opacity")}
          min={0}
          max={100}
          step={1}
          value={settings.subBgOpacity}
          format={(value) => `${Math.round(value)}%`}
          onChange={(value) => onPatchSettings({ subBgOpacity: value })}
        />
      </Section>
      <Button
        className="h-auto px-2 py-1 text-xs"
        onClick={() => onPatchSettings({ ...DEFAULT_PLAYER_SETTINGS })}
      >
        {t("player.media.settings.reset")}
      </Button>
    </div>
  );
}

export default SettingsPanel;
