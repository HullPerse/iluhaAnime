import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { PLAYER_PROFILE_IDS } from "@/config/player/profiles.config";
import { useI18n } from "@/hooks/i18n.hook";
import { DEFAULT_PLAYER_SETTINGS } from "@/store/player.store";
import type {
  EndOfFileMode,
  HwdecMode,
  PlayerProfileId,
  PlayerSettings,
  SeekMode,
} from "@/types/videoPlayer";

import PlayerSlider from "./slider.player";

const FONT_OPTIONS = ["Arial", "Verdana", "Tahoma", "Segoe UI", "Courier New", "Times New Roman"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-muted flex flex-col gap-1 border-b-2 pb-2">
      <span className="windows95-text text-xs font-bold">{title}</span>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-row items-center gap-1">
      <span className="windows95-font w-28 shrink-0 text-xs">{label}</span>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="color"
      className="windows95-border h-5 w-12 cursor-pointer bg-white p-0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SettingsPanel({
  settings,
  hwdec,
  seekMode,
  eofMode,
  autoHide,
  profile,
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
  onPatchSettings: (patch: Partial<PlayerSettings>) => void;
  onHwdec: (mode: HwdecMode) => void;
  onSeekMode: (mode: SeekMode) => void;
  onEofMode: (mode: EndOfFileMode) => void;
  onAutoHide: (autoHide: boolean) => void;
  onProfile: (profile: PlayerProfileId) => void;
}) {
  const { t } = useI18n();
  const aspectOptions = [
    { value: "contain", label: t("player.media.settings.ar.contain") },
    { value: "fill", label: t("player.media.settings.ar.fill") },
    { value: "cover", label: t("player.media.settings.ar.cover") },
    { value: "none", label: t("player.media.settings.ar.none") },
    { value: "scale-down", label: t("player.media.settings.ar.scale.down") },
  ];
  const fontOptions = FONT_OPTIONS.map((font) => ({ value: font, label: font }));
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

  return (
    <div className="flex w-full flex-col gap-2">
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
        <Row label={t("player.media.settings.profile")}>
          <Select
            className="flex-1"
            value={profile}
            options={profileOptions}
            onChange={(value) => onProfile(value as PlayerProfileId)}
          />
        </Row>
      </Section>
      <Section title={t("player.media.settings.transform")}>
        <PlayerSlider
          label={t("player.media.settings.rotation")}
          min={0}
          max={360}
          step={1}
          value={settings.rotation}
          format={(value) => `${value}°`}
          onChange={(value) => onPatchSettings({ rotation: value })}
        />
        <Row label={t("player.media.settings.flip.h")}>
          <Checkbox
            checked={settings.flipH}
            onChange={(value) => onPatchSettings({ flipH: value })}
            aria-label={t("player.media.settings.flip.h")}
          />
        </Row>
        <Row label={t("player.media.settings.flip.v")}>
          <Checkbox
            checked={settings.flipV}
            onChange={(value) => onPatchSettings({ flipV: value })}
            aria-label={t("player.media.settings.flip.v")}
          />
        </Row>
        <PlayerSlider
          label={t("player.media.settings.zoom")}
          min={0.1}
          max={3}
          step={0.01}
          value={settings.zoom}
          format={(value) => `${value.toFixed(2)}x`}
          onChange={(value) => onPatchSettings({ zoom: value })}
        />
        <Row label={t("player.media.settings.aspect")}>
          <Select
            className="flex-1"
            value={settings.aspectRatio}
            options={aspectOptions}
            onChange={(value) =>
              onPatchSettings({ aspectRatio: value as PlayerSettings["aspectRatio"] })
            }
          />
        </Row>
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
        <PlayerSlider
          label={t("player.media.settings.blur")}
          min={0}
          max={20}
          step={0.5}
          value={settings.blur}
          format={(value) => `${value.toFixed(1)}`}
          onChange={(value) => onPatchSettings({ blur: value })}
        />
        <PlayerSlider
          label={t("player.media.settings.sepia")}
          min={0}
          max={100}
          step={1}
          value={settings.sepia}
          format={(value) => `${value}%`}
          onChange={(value) => onPatchSettings({ sepia: value })}
        />
        <PlayerSlider
          label={t("player.media.settings.grayscale")}
          min={0}
          max={100}
          step={1}
          value={settings.grayscale}
          format={(value) => `${value}%`}
          onChange={(value) => onPatchSettings({ grayscale: value })}
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
        {settings.toneMap === "manual" ? (
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
        ) : null}
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
