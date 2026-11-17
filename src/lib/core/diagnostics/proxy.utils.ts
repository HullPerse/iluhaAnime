import { effectiveProxyUrl, searchProxyUrl } from "@/lib/core/system/proxy.utils";
import type {
  DiagnosticProbe,
  DiagnosticProxyKey,
  DiagnosticTask,
} from "@/types/core/diagnostics";
import type { SettingsData } from "@/types/store/settings";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function resolveProbeProxy(
  key: DiagnosticProxyKey,
  settings: SettingsData
): string | null {
  switch (key) {
    case "anilist": {
      return clean(settings.anilistProxyUrl);
    }
    case "cardsImage": {
      return effectiveProxyUrl(settings.cardsImageProxyUrl, settings.anilistProxyUrl);
    }
    case "daily": {
      return effectiveProxyUrl(settings.dailyProxyUrl, settings.anilistProxyUrl);
    }
    case "dailyOpening": {
      return effectiveProxyUrl(settings.dailyOpeningProxyUrl, settings.anilistProxyUrl);
    }
    case "animelib": {
      return effectiveProxyUrl(settings.animelibProxyUrl, settings.anilistProxyUrl);
    }
    case "news": {
      return clean(settings.newsProxyUrl);
    }
    case "none": {
      return null;
    }
    default: {
      const source = key.slice("source:".length);
      return searchProxyUrl(settings.searchProxyUrls, source) ?? null;
    }
  }
}

export function probeProxySettingsSection(key: DiagnosticProxyKey): string | null {
  switch (key) {
    case "none": {
      return null;
    }
    case "anilist": {
      return "proxy.anilist";
    }
    case "cardsImage":
    case "daily":
    case "dailyOpening": {
      return "proxy.collection";
    }
    case "animelib": {
      return "proxy.animelib";
    }
    case "news": {
      return "proxy.news";
    }
    default: {
      return "proxy.sources";
    }
  }
}

export function buildDiagnosticTasks(
  probes: readonly DiagnosticProbe[],
  settings: SettingsData
) {
  return probes.flatMap((probe) => {
    const proxyUrl = resolveProbeProxy(probe.proxy, settings);
    const tasks: DiagnosticTask[] = [
      {
        probe,
        mode: "direct",
        proxyUrl: null,
        proxyConfigured: proxyUrl !== null,
      },
    ];
    if (proxyUrl !== null) {
      tasks.push({
        probe,
        mode: "proxy" as const,
        proxyUrl,
        proxyConfigured: true,
      });
    }
    return tasks;
  });
}
