import anilist from "./en/anilist";
import common from "./en/common";
import collection from "./en/collection";
import player from "./en/player";
import search from "./en/search";
import settings from "./en/settings";
import torrent from "./en/torrent";
import updater from "./en/updater";

const en = {
  ...anilist,
  ...common,
  ...collection,
  ...player,
  ...search,
  ...settings,
  ...torrent,
  ...updater,
} as const;

export default en;
