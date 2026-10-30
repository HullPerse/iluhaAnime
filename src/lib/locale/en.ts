import changelog320 from "@/lib/locale/changelog/v3_2_0.en";
import changelog400 from "@/lib/locale/changelog/v4_0_0.en";
import changelog401 from "@/lib/locale/changelog/v4_0_1.en";
import changelog402 from "@/lib/locale/changelog/v4_0_2.en";
import changelog403 from "@/lib/locale/changelog/v4_0_3.en";
import changelog404 from "@/lib/locale/changelog/v4_0_4.en";
import changelog405 from "@/lib/locale/changelog/v4_0_5.en";
import changelog406 from "@/lib/locale/changelog/v4_0_6.en";
import changelog407 from "@/lib/locale/changelog/v4_0_7.en";
import changelog408 from "@/lib/locale/changelog/v4_0_8.en";
import changelog409 from "@/lib/locale/changelog/v4_0_9.en";
import changelog410 from "@/lib/locale/changelog/v4_1_0.en";
import changelog411 from "@/lib/locale/changelog/v4_1_1.en";
import changelog412 from "@/lib/locale/changelog/v4_1_2.en";
import changelog413 from "@/lib/locale/changelog/v4_1_3.en";
import changelog500 from "@/lib/locale/changelog/v5_0_0.en";
import anilist from "@/lib/locale/en/anilist.locale";
import collection from "@/lib/locale/en/collection.locale";
import common from "@/lib/locale/en/common.locale";
import discord from "@/lib/locale/en/discord.locale";
import game from "@/lib/locale/en/game.locale";
import keyboard from "@/lib/locale/en/keyboard.locale";
import player from "@/lib/locale/en/player.locale";
import screenshot from "@/lib/locale/en/screenshot.locale";
import search from "@/lib/locale/en/search.locale";
import settings from "@/lib/locale/en/settings.locale";
import torrent from "@/lib/locale/en/torrent.locale";
import updater from "@/lib/locale/en/updater.locale";

const en = {
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

export default en;
