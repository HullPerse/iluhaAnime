#!/usr/bin/env bun
import { CONFIG_REGISTRY } from "../src/config/registry.config";
import "../src/config/anilist/anilistFilters.config";
import "../src/config/anilist/status.config";
import "../src/config/anilist/statuses.config";
import "../src/config/graphics/blueNoise.config";
import "../src/config/graphics/graph.config";
import "../src/config/graphics/icons.config";
import "../src/config/graphics/screenshot.config";
import "../src/config/graphics/sizes.config";
import "../src/config/graphics/themes.config";
import "@hullperse/hp_utils/tokens";
import "../src/config/graphics/wallpaper.config";
import "../src/config/registry.config";
import "../src/config/settings/find.config";
import "../src/config/settings/flags.config";
import "../src/config/settings/modes.config";
import "../src/config/settings/options.config";
import "../src/config/settings/presets.config";
import "../src/config/settings/profiles.config";
import "../src/config/settings/settingsDefaults.config";
import "../src/config/settings/vim.config";
import "../src/config/system/changelog.config";

import {
  DIAGNOSTIC_GROUPS,
  DIAGNOSTIC_PROBES,
} from "../src/config/diagnostics/probes.config";
import {
  SOURCE_DIAGNOSTIC_PROBE,
  SOURCE_INFOS,
} from "../src/config/search/searchSources.config";
import {
  KEYBINDS,
  PLAYER_HOTKEYS,
} from "../src/config/settings/keybinds.config";
import {
  CRT_CURVATURES,
  PLAYER_CABINETS,
  PLAYER_MODE_IDS,
  PLAYER_MODES,
} from "../src/config/settings/modes.config";
import {
  TAB_PATHS,
  tabIdFromPath,
  tabPathFromId,
} from "../src/config/settings/tabPaths.config";
import {
  ZAPRET_ALL_IPS,
  ZAPRET_HOSTLIST,
  ZAPRET_SAFE_IPS,
  zapretLocalEndpoint,
} from "../src/config/settings/zapret.config";
import {
  KEYBIND_MANIFEST,
  keybindEntriesByScope,
} from "../src/config/system/manifest.config";
import { QUERY_PRESETS } from "../src/config/system/query.config";
import { chordKey, parseChord } from "../src/lib/core/hotkeys/chordHotkeys.utils";
import { createHotkeyRegistry } from "../src/lib/core/hotkeys/registryHotkeys.utils";
import ru from "../src/lib/locale/ru";
import type { TabId } from "../src/types/ui/settings";

const RU: Record<string, string> = ru;

function fail(message: string): never {
  throw new Error(`config:validate failed: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function checkKeybinds() {
  const chords = new Set<string>();

  for (const keybind of KEYBINDS) {
    const chord = parseChord(keybind.chord);
    assert(chord, `keybind ${keybind.action}: unparseable chord ${keybind.chord}`);
    assert(!chords.has(keybind.chord), `keybind ${keybind.action}: duplicate chord ${keybind.chord}`);
    assert(keybind.keys.length > 0, `keybind ${keybind.action}: empty key label`);
    assert(keybind.description.length > 0, `keybind ${keybind.action}: empty description`);
    chords.add(keybind.chord);
  }

  const registry = createHotkeyRegistry(PLAYER_HOTKEYS);
  assert(registry.size === KEYBINDS.length, "player hotkeys do not cover every keybind");

  for (const keybind of KEYBINDS) {
    const chord = parseChord(keybind.chord);
    assert(chord, `keybind ${keybind.action}: unparseable chord ${keybind.chord}`);
    const key = `${chord.code}:${chord.ctrl}:${chord.shift}:${chord.alt}:${chord.meta}`;
    assert(registry.get(key)?.id === keybind.action, `keybind ${keybind.action}: registry mismatch`);
  }
}

function checkManifest() {
  const ids = new Set<string>();
  const scopedChords = new Set<string>();

  for (const entry of KEYBIND_MANIFEST) {
    assert(!ids.has(entry.id), `manifest: duplicate id ${entry.id}`);
    ids.add(entry.id);

    const chord = parseChord(entry.chord);
    assert(chord, `manifest ${entry.id}: unparseable chord ${entry.chord}`);
    const scoped = `${entry.scope}:${chordKey(chord)}`;
    assert(!scopedChords.has(scoped), `manifest ${entry.id}: chord clash in ${entry.scope}`);
    scopedChords.add(scoped);

    assert(RU[entry.description], `manifest ${entry.id}: missing ru description ${entry.description}`);
  }

  const playerChords = new Set(keybindEntriesByScope("player").map((entry) => entry.chord));

  for (const keybind of KEYBINDS) {
    assert(playerChords.has(keybind.chord), `manifest: missing player keybind ${keybind.action}`);
  }

  const vimEntries = keybindEntriesByScope("vim");
  assert(vimEntries.length > 0, "manifest: no vim entries");
  assert(
    vimEntries.every((entry) => entry.mode === "vim"),
    "manifest: vim scope contains a non-vim entry"
  );
}

function checkDiagnostics() {
  const ids = new Set<string>();
  const groups = new Set(DIAGNOSTIC_GROUPS.map((group) => group.id));

  for (const probe of DIAGNOSTIC_PROBES) {
    assert(!ids.has(probe.id), `diagnostics: duplicate probe id ${probe.id}`);
    ids.add(probe.id);

    const url = new URL(probe.url);
    assert(url.protocol === "https:", `diagnostics ${probe.id}: non-https URL`);
    assert(["GET", "HEAD", "POST"].includes(probe.method), `diagnostics ${probe.id}: bad method`);
    assert(probe.expectedStatus.length > 0, `diagnostics ${probe.id}: empty expected status`);

    if (probe.body !== undefined) {
      assert(probe.method === "POST", `diagnostics ${probe.id}: body requires POST`);
    }

    assert(groups.has(probe.group), `diagnostics ${probe.id}: unknown group ${probe.group}`);
  }

  for (const source of SOURCE_INFOS) {
    const probe = DIAGNOSTIC_PROBES.find(
      (entry) => entry.id === SOURCE_DIAGNOSTIC_PROBE[source.value]
    );
    assert(probe, `diagnostics: missing probe for source ${source.value}`);
    assert(
      probe.proxy === `source:${source.value}`,
      `diagnostics ${probe.id}: source proxy mismatch`
    );
  }

  const critical = DIAGNOSTIC_PROBES.filter((probe) => probe.weight === "critical");
  assert(critical.length >= 15 && critical.length <= 25, "diagnostics: quick mode size is wrong");
  assert(critical.length < DIAGNOSTIC_PROBES.length, "diagnostics: quick mode is not a subset");
  assert(DIAGNOSTIC_PROBES.length <= 25, "diagnostics: full mode is wider than 25 probes");
}

function checkModes() {
  for (const id of PLAYER_MODE_IDS) {
    assert(PLAYER_MODES[id].id === id, `modes: mismatched id ${id}`);
    const mode = PLAYER_MODES[id];

    if (id === "normal") {
      assert(mode.shader === null, "modes: normal must not use a shader");
      assert(Object.keys(mode.params).length === 0, "modes: normal must not have params");
    } else {
      assert(mode.shader !== null, `modes: ${id} must use a shader`);
      assert(Object.keys(mode.params).length > 0, `modes: ${id} must have params`);
    }
  }

  const editable = PLAYER_MODE_IDS.filter((id) => PLAYER_MODES[id].curvatureEditable);
  assert(
    editable.join(",") === "tv,mono",
    `modes: editable curvature set is ${editable.join(",")}`
  );

  const shaders = [
    ...new Set(PLAYER_MODE_IDS.map((id) => PLAYER_MODES[id].shader).filter((shader) => shader !== null)),
  ].sort();
  assert(shaders.join(",") === "crt-tv,vhs", `modes: shader set is ${shaders.join(",")}`);
  assert(CRT_CURVATURES.join(",") === "0.02,0.04,0.07", "modes: curvature steps changed");
  assert(
    Object.keys(PLAYER_CABINETS).join(",") === "none,win95,wood",
    "modes: cabinet set changed"
  );
}

function checkPaths() {
  const ids = Object.keys(TAB_PATHS) as TabId[];
  assert(ids.length === 10, `paths: expected 10 tabs, got ${ids.length}`);

  const paths = new Set<string>();

  for (const id of ids) {
    const path = TAB_PATHS[id];
    assert(path.startsWith("/"), `paths: ${id} does not start with /`);
    assert(!paths.has(path), `paths: duplicate path ${path}`);
    paths.add(path);
    assert(tabPathFromId(id) === path, `paths: id lookup mismatch for ${id}`);
    assert(tabIdFromPath(path) === id, `paths: path lookup mismatch for ${path}`);
  }

  assert(tabIdFromPath("/definitely-not-a-route") === undefined, "paths: unknown path resolved");
  assert(tabIdFromPath("/player-window") === undefined, "paths: window route resolved");
}

function checkZapret() {
  assert(new Set(ZAPRET_HOSTLIST).size === ZAPRET_HOSTLIST.length, "zapret: duplicate hostname");
  assert(new Set(ZAPRET_ALL_IPS).size === ZAPRET_ALL_IPS.length, "zapret: duplicate address");

  for (const ip of ZAPRET_SAFE_IPS) {
    assert(ZAPRET_ALL_IPS.includes(ip), `zapret: safe IP ${ip} is missing from the full list`);
  }

  for (const host of [
    "graphql.anilist.co",
    "shikimori.io",
    "api.tenrai.org",
    "graphql.animethemes.moe",
    "animelib.org",
    "kodikplayer.com",
    "nyaa.si",
    "rutracker.org",
    "github.com",
  ]) {
    assert(
      ZAPRET_HOSTLIST.some((entry) => entry === host),
      `zapret: missing core host ${host}`
    );
  }

  assert(zapretLocalEndpoint(11200) === "127.0.0.1:11200", "zapret: wrong local endpoint");
}

function checkQueries() {
  for (const [name, preset] of Object.entries(QUERY_PRESETS)) {
    assert(
      preset.gcTime > preset.staleTime || preset.staleTime === Number.POSITIVE_INFINITY,
      `query: ${name} evicts cache before it goes stale`
    );
  }

  assert(QUERY_PRESETS.slow.staleTime === 5 * 60 * 1000, "query: slow staleTime changed");
}

checkKeybinds();
checkManifest();
checkDiagnostics();
checkModes();
checkPaths();
checkZapret();
checkQueries();

console.log(
  `config:validate OK - ${CONFIG_REGISTRY.length} configs registered, static invariants and data-driven configs parsed successfully`
);
