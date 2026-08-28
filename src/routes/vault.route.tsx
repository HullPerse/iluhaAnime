import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  HeartPulse,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import {
  buildOrganizationPreview,
  buildVaultEpisodeMatrix,
  buildVaultHealthReport,
  formatVaultBytes,
  restoreVaultEntries,
} from "@/lib/anime.vault";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  VideoFileEntry,
  VaultHealthReport,
  VaultIssue,
  VaultOrganizationPlan,
  VaultStoredMediaRecord,
} from "@/types";

export default function VaultRoute() {
  const { t } = useI18n();
  const savedFolderPaths = useSettingsStore((state) => state.savedFolderPaths);
  const videoExtensions = useSettingsStore((state) => state.videoExtensions);
  const [report, setReport] = useState<VaultHealthReport | null>(null);
  const [plan, setPlan] = useState<VaultOrganizationPlan[]>([]);
  const [scanning, setScanning] = useState(false);
  const [root, setRoot] = useState(savedFolderPaths[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [issueFilter, setIssueFilter] = useState<"all" | VaultIssue["kind"]>(
    "all"
  );
  const [selectedEpisodeKey, setSelectedEpisodeKey] = useState<string | null>(
    null
  );
  const episodeMatrix = useMemo(
    () => buildVaultEpisodeMatrix(report?.files ?? []),
    [report]
  );

  useEffect(() => {
    if (report || savedFolderPaths.length === 0) return;
    let active = true;
    invoke<VaultStoredMediaRecord[]>("get_vault_media_records", {
      limit: 20_000,
    })
      .then((records) => {
        if (!active) return;
        const entries = restoreVaultEntries(records);
        if (entries.length === 0) return;
        const next = buildVaultHealthReport(entries, t);
        setReport(next);
        setPlan(
          buildOrganizationPreview(
            next.files,
            root || savedFolderPaths[0] || ""
          )
        );
      })
      .catch(() => {
        // A first install or web preview has no persisted Vault records yet.
      });
    return () => {
      active = false;
    };
  }, [report, root, savedFolderPaths, t]);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const entries: VideoFileEntry[] = [];
      for (const path of savedFolderPaths) {
        const result = await invoke<VideoFileEntry[]>("scan_video_folder", {
          path,
          extensions: [
            ...videoExtensions,
            "srt",
            "ass",
            "ssa",
            "vtt",
            "sup",
            "sub",
          ],
        });
        entries.push(...result);
      }
      const next = buildVaultHealthReport(entries, t);
      setReport(next);
      setPlan(
        buildOrganizationPreview(next.files, root || savedFolderPaths[0] || "")
      );
      invoke("save_vault_media_records", {
        records: next.files.map((file) => ({
          path: file.path,
          name: file.name,
          size: file.size,
          title: file.title,
          season: file.season,
          episode: file.episode,
          quality: file.quality,
          codec: file.codec,
          subtitleLikely: file.subtitleLikely,
        })),
        scopes: savedFolderPaths,
      }).catch(() => {
        // The report remains usable in preview/web mode when SQLite IPC is unavailable.
      });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }, [root, savedFolderPaths, t, videoExtensions]);

  const chooseRoot = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setRoot(selected);
      if (report) setPlan(buildOrganizationPreview(report.files, selected));
    }
  }, [report]);

  const organizationMoves = useMemo(
    () =>
      plan.filter(
        (item) => item.action === "move" && item.sourcePath !== item.targetPath
      ),
    [plan]
  );

  const applyOrganization = useCallback(async () => {
    if (!root || organizationMoves.length === 0 || applying) return;
    setApplying(true);
    setError(null);
    try {
      const result = await invoke<{
        moved: number;
        skipped: number;
        errors: string[];
      }>("apply_vault_organization", {
        root,
        moves: organizationMoves,
      });
      if (result.errors.length > 0) {
        setError(
          `${t("vault.movedSummary", { count: result.moved })} ${result.errors.join(" - ")}`
        );
      }
      setPendingApply(false);
      await scan();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setApplying(false);
    }
  }, [applying, organizationMoves, root, scan, t]);

  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of report?.issues ?? [])
      counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1);
    return counts;
  }, [report]);
  const visibleIssues = useMemo(
    () =>
      (report?.issues ?? []).filter(
        (issue) => issueFilter === "all" || issue.kind === issueFilter
      ),
    [issueFilter, report]
  );
  const selectedEpisode = episodeMatrix.find(
    (row) => row.key === selectedEpisodeKey
  );

  return (
    <main className="windows95-text flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
      <header className="windows95-active-border bg-primary flex flex-wrap items-center gap-1 p-1">
        <img src="/images/w98_directory_zipper.ico" alt="" className="size-5" />
        <strong>{t("vault.title")}</strong>
        <span className="text-hint text-xs">{t("vault.safeMode")}</span>
        <Button
          className="ml-auto"
          onClick={scan}
          disabled={scanning || savedFolderPaths.length === 0}
        >
          <HeartPulse className="size-3" />{" "}
          {scanning ? t("vault.scanning") : t("vault.scan")}
        </Button>
      </header>

      {error && (
        <section className="windows95-border bg-destructive/10 text-destructive p-2 text-xs">
          {error}
        </section>
      )}

      {report && (
        <>
          <section className="grid grid-cols-2 gap-1 md:grid-cols-4">
            <Metric
              icon={<CheckCircle2 className="text-success size-4" />}
              label={t("vault.filesOk")}
              value={String(report.okCount)}
            />
            <Metric
              icon={<AlertTriangle className="text-highlight size-4" />}
              label={t("vault.missing")}
              value={String(issueCounts.get("missing") ?? 0)}
            />
            <Metric
              icon={<RefreshCw className="text-highlight size-4" />}
              label={t("vault.duplicates")}
              value={String(issueCounts.get("duplicate") ?? 0)}
            />
            <Metric
              icon={<ShieldCheck className="text-secondary size-4" />}
              label={t("vault.storage")}
              value={formatVaultBytes(report.totalBytes)}
            />
          </section>

          <section className="windows95-active-border bg-primary p-2">
            <div className="flex flex-wrap items-center gap-1">
              <strong>{t("vault.episodeMatrix")}</strong>
              <span className="text-hint text-xs">
                {t("vault.episodeMatrixHint")}
              </span>
            </div>
            <div className="windows95-border mt-1 max-h-52 overflow-y-auto bg-white">
              {episodeMatrix.slice(0, 200).map((row) => (
                <div
                  key={row.key}
                  role={row.duplicateCount > 0 ? "button" : undefined}
                  tabIndex={row.duplicateCount > 0 ? 0 : undefined}
                  onClick={() =>
                    row.duplicateCount > 0 &&
                    setSelectedEpisodeKey((current) =>
                      current === row.key ? null : row.key
                    )
                  }
                  onKeyDown={enterOrSpace(() => {
                    if (row.duplicateCount > 0) {
                      setSelectedEpisodeKey((current) =>
                        current === row.key ? null : row.key
                      );
                    }
                  })}
                  className={`border-muted grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b px-1 py-0.5 text-xs ${row.duplicateCount > 0 ? "hover:bg-surface cursor-pointer" : ""}`}
                >
                  <span className="truncate" title={row.bestRelease.path}>
                    {row.title} - S{String(row.season).padStart(2, "0")}E
                    {String(row.episode).padStart(2, "0")}
                  </span>
                  <span className="text-hint">
                    {row.bestRelease.quality ?? "-"}
                  </span>
                  <span className="text-hint">
                    {row.bestRelease.codec ?? "-"}
                  </span>
                  <span
                    className={
                      row.duplicateCount > 0
                        ? "text-highlight"
                        : row.hasSubtitle
                          ? "text-success"
                          : "text-hint"
                    }
                  >
                    {row.duplicateCount > 0
                      ? t("vault.releaseCount", { count: row.releases.length })
                      : row.hasSubtitle
                        ? t("vault.subtitleDetected")
                        : t("vault.subtitleUnverified")}
                  </span>
                </div>
              ))}
              {episodeMatrix.length === 0 && (
                <div className="text-hint p-2 text-xs">
                  {t("vault.noEpisodes")}
                </div>
              )}
            </div>
            {selectedEpisode && (
              <div className="windows95-border mt-1 bg-white p-1 text-xs">
                <strong>
                  {t("vault.releasesFor", { title: selectedEpisode.title })}
                </strong>
                {selectedEpisode.releases.map((release) => (
                  <div
                    key={release.path}
                    className="border-muted flex items-center gap-2 border-b py-0.5 last:border-0"
                  >
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={release.path}
                    >
                      {release.name}
                    </span>
                    <span className="text-hint shrink-0">
                      {formatVaultBytes(release.size)}
                    </span>
                    {release.path === selectedEpisode.bestRelease.path && (
                      <span className="text-success shrink-0">
                        {t("vault.bestRelease")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="windows95-active-border bg-primary p-2">
            <div className="flex flex-wrap items-center gap-1">
              <strong>{t("vault.organization")}</strong>
              <span className="text-hint text-xs">
                {t("vault.organizationHint")}
              </span>
              <Button
                size="icon"
                className="ml-auto size-6"
                onClick={chooseRoot}
                title={t("vault.chooseRoot")}
              >
                <FolderOpen className="size-3" />
              </Button>
            </div>
            <div className="windows95-border mt-1 max-h-44 overflow-y-auto bg-white">
              {plan.slice(0, 100).map((item) => (
                <div
                  key={item.sourcePath}
                  className="border-muted grid grid-cols-[1fr_auto] gap-2 border-b px-1 py-0.5 text-xs"
                >
                  <span className="truncate" title={item.sourcePath}>
                    {item.sourcePath}
                  </span>
                  <span
                    className={
                      item.action === "review" ? "text-highlight" : "text-hint"
                    }
                  >
                    {item.targetPath}
                  </span>
                </div>
              ))}
              {plan.length === 0 && (
                <div className="text-hint p-2 text-xs">
                  {t("vault.noPlan")}
                </div>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-hint flex-1 text-xs">
                {t("vault.noMoves")}
              </span>
              <Button
                variant="success"
                onClick={() => setPendingApply(true)}
                disabled={applying || organizationMoves.length === 0 || !root}
                title={t("vault.applyTitle")}
              >
                {applying ? t("vault.applying") : t("vault.apply")}
              </Button>
            </div>
          </section>

          <section className="windows95-active-border bg-primary p-2">
            <div className="flex flex-wrap items-center gap-1">
              <strong>{t("vault.health")}</strong>
              {(["all", "missing", "duplicate", "subtitle"] as const).map(
                (kind) => (
                  <Button
                    key={kind}
                    className="px-1 py-0.5 text-xs"
                    variant={issueFilter === kind ? "outline" : "default"}
                    onClick={() => setIssueFilter(kind)}
                  >
                    {t(`vault.filter.${kind}` as never)}
                  </Button>
                )
              )}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {visibleIssues.slice(0, 80).map((issue, index) => (
                <div
                  key={`${issue.kind}-${index}`}
                  className="flex gap-1 text-xs"
                >
                  <AlertTriangle className="text-highlight mt-0.5 size-3 shrink-0" />
                  <span>{issue.message}</span>
                </div>
              ))}
              {visibleIssues.length === 0 && (
                <div className="text-success flex items-center gap-1 text-xs">
                  <CheckCircle2 className="size-3" />
                  {t(
                    issueFilter === "all"
                      ? "vault.healthy"
                      : "vault.noFilteredIssues"
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="windows95-active-border bg-primary p-2 text-xs">
            <strong>{t("vault.optimizer")}</strong>
            <p className="text-hint">
              {t("vault.optimizerHint", {
                size: formatVaultBytes(report.reclaimableBytes),
              })}
            </p>
            <div
              className="text-hint flex items-center gap-1"
              title={t("vault.optimizerDisabled")}
            >
              <ShieldCheck className="size-3" />
              {t("vault.previewOnly")}
            </div>
          </section>
        </>
      )}
      {pendingApply && (
        <ConfirmDialog
          open
          title={t("vault.applyTitle")}
          message={t("vault.applyMessage", { count: organizationMoves.length })}
          confirmLabel={t("vault.apply")}
          variant="destructive"
          onConfirm={() => applyOrganization()}
          onCancel={() => setPendingApply(false)}
          onClose={() => setPendingApply(false)}
        />
      )}
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <section className="windows95-active-border bg-primary flex items-center gap-1 p-2">
      <div>{icon}</div>
      <div className="min-w-0">
        <div className="text-hint truncate text-xs">{label}</div>
        <strong className="text-sm">{value}</strong>
      </div>
    </section>
  );
}
