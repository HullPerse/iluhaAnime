import type changelog320 from "@/lib/locale/changelog/v3_2_0.ru";
import type changelog400 from "@/lib/locale/changelog/v4_0_0.ru";
import type changelog401 from "@/lib/locale/changelog/v4_0_1.ru";
import type changelog402 from "@/lib/locale/changelog/v4_0_2.ru";
import type changelog403 from "@/lib/locale/changelog/v4_0_3.ru";
import type changelog404 from "@/lib/locale/changelog/v4_0_4.ru";
import type changelog405 from "@/lib/locale/changelog/v4_0_5.ru";
import type changelog406 from "@/lib/locale/changelog/v4_0_6.ru";
import type changelog407 from "@/lib/locale/changelog/v4_0_7.ru";
import type changelog408 from "@/lib/locale/changelog/v4_0_8.ru";
import type changelog409 from "@/lib/locale/changelog/v4_0_9.ru";
import type changelog410 from "@/lib/locale/changelog/v4_1_0.ru";
import type changelog411 from "@/lib/locale/changelog/v4_1_1.ru";
import type changelog412 from "@/lib/locale/changelog/v4_1_2.ru";
import type changelog413 from "@/lib/locale/changelog/v4_1_3.ru";
import type changelog500 from "@/lib/locale/changelog/v5_0_0.ru";
import type changelog510 from "@/lib/locale/changelog/v5_1_0.ru";
import type changelog512 from "@/lib/locale/changelog/v5_1_2.ru";
import type changelog514 from "@/lib/locale/changelog/v5_1_4.ru";
import type changelog516 from "@/lib/locale/changelog/v5_1_6.ru";
import type changelog520 from "@/lib/locale/changelog/v5_2_0.ru";
import type changelog522 from "@/lib/locale/changelog/v5_2_2.ru";
import type changelog523 from "@/lib/locale/changelog/v5_2_3.ru";
import type changelog525 from "@/lib/locale/changelog/v5_2_5.ru";
import type changelog530 from "@/lib/locale/changelog/v5_3_0.ru";
import type changelog540 from "@/lib/locale/changelog/v5_4_0.ru";
import anilist from "@/lib/locale/ru/anilist.locale";
import collection from "@/lib/locale/ru/collection.locale";
import common from "@/lib/locale/ru/common.locale";
import discord from "@/lib/locale/ru/discord.locale";
import game from "@/lib/locale/ru/game.locale";
import news from "@/lib/locale/ru/news.locale";
import keyboard from "@/lib/locale/ru/keyboard.locale";
import manga from "@/lib/locale/ru/manga.locale";
import player from "@/lib/locale/ru/player.locale";
import screenshot from "@/lib/locale/ru/screenshot.locale";
import search from "@/lib/locale/ru/search.locale";
import settings from "@/lib/locale/ru/settings.locale";
import torrent from "@/lib/locale/ru/torrent.locale";
import updater from "@/lib/locale/ru/updater.locale";

const ru = {
  ...anilist,
  ...common,
  ...keyboard,
  ...collection,
  ...discord,
  ...game,
  ...manga,
  ...news,
  ...player,
  ...screenshot,
  ...search,
  ...settings,
  ...torrent,
  ...updater,
} as const;

/**
 * The changelog strings live in a lazy chunk, but their keys stay part of the
 * translation type so `t()` call sites keep type checking.
 */
type ChangelogDictionary = typeof changelog320 &
  typeof changelog400 &
  typeof changelog401 &
  typeof changelog402 &
  typeof changelog403 &
  typeof changelog404 &
  typeof changelog405 &
  typeof changelog406 &
  typeof changelog407 &
  typeof changelog408 &
  typeof changelog409 &
  typeof changelog410 &
  typeof changelog411 &
  typeof changelog412 &
  typeof changelog413 &
  typeof changelog500 &
  typeof changelog510 &
  typeof changelog512 &
  typeof changelog514 &
  typeof changelog516 &
  typeof changelog520 &
  typeof changelog522 &
  typeof changelog523 &
  typeof changelog525 &
  typeof changelog530 &
  typeof changelog540;

export type RuDictionary = typeof ru & ChangelogDictionary;

export default ru;
