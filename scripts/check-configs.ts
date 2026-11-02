#!/usr/bin/env bun
/**
 * Validates all data-driven config modules by importing them.
 * Each migrated config parses its JSON with zod at module load, so an
 * invalid data file throws here and fails the check.
 */
import { CONFIG_REGISTRY } from "../src/config/registry.config";
import "../src/config/anilist/anilistFilters.config";
import "../src/config/anilist/status.config";
import "../src/config/anilist/statuses.config";
import "../src/config/graphics/blueNoise.config";
import "../src/config/graphics/graph.config";
import "../src/config/graphics/icons.config";
import "../src/config/graphics/screenshot.config";
import "../src/config/graphics/sizes.config";
import "../src/config/graphics/tags.config";
import "../src/config/graphics/themes.config";
import "../src/config/graphics/tokens.config";
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

console.log(`config:validate OK - ${CONFIG_REGISTRY.length} configs registered, all data-driven configs parsed successfully`);