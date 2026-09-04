import anilist from "./ru/anilist";
import common from "./ru/common";
import collection from "./ru/collection";
import player from "./ru/player";
import search from "./ru/search";
import settings from "./ru/settings";
import torrent from "./ru/torrent";
import updater from "./ru/updater";

const ru = {
  ...anilist,
  ...common,
  ...collection,
  ...player,
  ...search,
  ...settings,
  ...torrent,
  ...updater,
} as const;

export default ru;
