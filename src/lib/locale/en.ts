import changelog320 from "./changelog/v3_2_0.en";
import changelog400 from "./changelog/v4_0_0.en";
import changelog401 from "./changelog/v4_0_1.en";
import changelog402 from "./changelog/v4_0_2.en";
import changelog403 from "./changelog/v4_0_3.en";
import changelog404 from "./changelog/v4_0_4.en";
import changelog405 from "./changelog/v4_0_5.en";
import changelog406 from "./changelog/v4_0_6.en";
import changelog407 from "./changelog/v4_0_7.en";
import changelog408 from "./changelog/v4_0_8.en";
import anilist from "./en/anilist.locale";
import collection from "./en/collection.locale";
import common from "./en/common.locale";
import player from "./en/player.locale";
import search from "./en/search.locale";
import settings from "./en/settings.locale";
import torrent from "./en/torrent.locale";
import updater from "./en/updater.locale";

const en = {
  ...anilist,
  ...changelog408,
  ...changelog407,
  ...changelog406,
  ...changelog405,
  ...changelog404,
  ...changelog403,
  ...changelog402,
  ...changelog401,
  ...changelog400,
  ...changelog320,
  ...common,
  ...collection,
  ...player,
  ...search,
  ...settings,
  ...torrent,
  ...updater,
} as const;

export default en;
