import changelog320 from "./changelog/v3_2_0.en";
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
