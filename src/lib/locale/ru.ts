import changelog320 from "./changelog/v3_2_0.ru";
import changelog400 from "./changelog/v4_0_0.ru";
import changelog401 from "./changelog/v4_0_1.ru";
import changelog402 from "./changelog/v4_0_2.ru";
import changelog403 from "./changelog/v4_0_3.ru";
import changelog404 from "./changelog/v4_0_4.ru";
import changelog405 from "./changelog/v4_0_5.ru";
import changelog406 from "./changelog/v4_0_6.ru";
import changelog407 from "./changelog/v4_0_7.ru";
import changelog408 from "./changelog/v4_0_8.ru";
import changelog409 from "./changelog/v4_0_9.ru";
import changelog410 from "./changelog/v4_1_0.ru";
import changelog411 from "./changelog/v4_1_1.ru";
import changelog412 from "./changelog/v4_1_2.ru";
import changelog413 from "./changelog/v4_1_3.ru";
import anilist from "./ru/anilist.locale";
import collection from "./ru/collection.locale";
import common from "./ru/common.locale";
import player from "./ru/player.locale";
import screenshot from "./ru/screenshot.locale";
import search from "./ru/search.locale";
import settings from "./ru/settings.locale";
import torrent from "./ru/torrent.locale";
import updater from "./ru/updater.locale";

const ru = {
  ...anilist,
  ...changelog413,
  ...changelog412,
  ...changelog411,
  ...changelog410,
  ...changelog409,
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
  ...screenshot,
  ...search,
  ...settings,
  ...torrent,
  ...updater,
} as const;

export default ru;
