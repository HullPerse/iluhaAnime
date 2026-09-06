import changelog320 from "./changelog/v3_2_0.ru";
import anilist from "./ru/anilist.locale";
import collection from "./ru/collection.locale";
import common from "./ru/common.locale";
import player from "./ru/player.locale";
import search from "./ru/search.locale";
import settings from "./ru/settings.locale";
import torrent from "./ru/torrent.locale";
import updater from "./ru/updater.locale";

const ru = {
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

export default ru;
