import changelog404 from "./changelog/v4_0_4.ru";
import changelog403 from "./changelog/v4_0_3.ru";
import changelog402 from "./changelog/v4_0_2.ru";
import changelog401 from "./changelog/v4_0_1.ru";
import changelog400 from "./changelog/v4_0_0.ru";
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

export default ru;
