import changelog320 from "@/lib/locale/changelog/v3_2_0.ru";
import changelog400 from "@/lib/locale/changelog/v4_0_0.ru";
import changelog401 from "@/lib/locale/changelog/v4_0_1.ru";
import changelog402 from "@/lib/locale/changelog/v4_0_2.ru";
import changelog403 from "@/lib/locale/changelog/v4_0_3.ru";
import changelog404 from "@/lib/locale/changelog/v4_0_4.ru";
import changelog405 from "@/lib/locale/changelog/v4_0_5.ru";
import changelog406 from "@/lib/locale/changelog/v4_0_6.ru";
import changelog407 from "@/lib/locale/changelog/v4_0_7.ru";
import changelog408 from "@/lib/locale/changelog/v4_0_8.ru";
import changelog409 from "@/lib/locale/changelog/v4_0_9.ru";
import changelog410 from "@/lib/locale/changelog/v4_1_0.ru";
import changelog411 from "@/lib/locale/changelog/v4_1_1.ru";
import changelog412 from "@/lib/locale/changelog/v4_1_2.ru";
import changelog413 from "@/lib/locale/changelog/v4_1_3.ru";
import changelog500 from "@/lib/locale/changelog/v5_0_0.ru";
import anilist from "@/lib/locale/ru/anilist.locale";
import collection from "@/lib/locale/ru/collection.locale";
import common from "@/lib/locale/ru/common.locale";
import discord from "@/lib/locale/ru/discord.locale";
import game from "@/lib/locale/ru/game.locale";
import keyboard from "@/lib/locale/ru/keyboard.locale";
import player from "@/lib/locale/ru/player.locale";
import screenshot from "@/lib/locale/ru/screenshot.locale";
import search from "@/lib/locale/ru/search.locale";
import settings from "@/lib/locale/ru/settings.locale";
import torrent from "@/lib/locale/ru/torrent.locale";
import updater from "@/lib/locale/ru/updater.locale";

const ru = {
  ...anilist,
  ...changelog500,
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
  ...keyboard,
  ...collection,
  ...discord,
  ...game,
  ...player,
  ...screenshot,
  ...search,
  ...settings,
  ...torrent,
  ...updater,
} as const;

export default ru;
