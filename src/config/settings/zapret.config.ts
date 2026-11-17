/**
 * Curated zapret lists for the app's runtime hosts.
 *
 * The hostlist is the primary list: domains survive IP changes and do not
 * affect unrelated sites on shared Cloudflare/DDoS-Guard addresses.
 */
export const ZAPRET_HOSTLIST = [
  // AniList / Collection
  "graphql.anilist.co",
  "anilist.co",
  "www.anilist.co",
  "s4.anilist.co",

  // Shikimori / Daily
  "shikimori.io",
  "shikimori.one",
  "shikimori.tv",
  "api.tenrai.org",

  // AnimeThemes / Daily openings
  "graphql.animethemes.moe",
  "v.animethemes.moe",
  "animethemes.moe",

  // AnimeLib / Kodik / Stream
  "animelib.org",
  "api.cdnlibs.org",
  "static.cdnlibs.org",
  "video1.cdnlibs.org",
  "video2.cdnlibs.org",
  "cover.imglib.info",
  "video1.imglib.info",
  "kodikplayer.com",
  "cloud2.solodcdn.com",

  // Torrents
  "nyaa.si",
  "sukebei.nyaa.si",
  "animetosho.org",
  "rutracker.org",
  "bt2.t-ru.org",
  "nekobt.to",
  "www.erai-raws.info",
  "ddl.erai-raws.info",

  // Torrent images / screenshots
  "img.rutracker.org",
  "static.rutracker.cc",
  "i.kek.sh",
  "imageban.ru",
  "i2.imageban.ru",
  "i3.imageban.ru",
  "i5.imageban.ru",
  "www.kinopoisk.ru",

  // News / embedded video
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "youtu.be",
  "img.youtube.com",
  "i.ytimg.com",
  "s.ytimg.com",
  "vk.com",
  "vkvideo.ru",
  "iv.okcdn.ru",

  // Updates / model and ffmpeg downloads
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "raw.githubusercontent.com",
  "gh-proxy.com",
  "www.gyan.dev",

  // Fallback trackers
  "tracker.opentrackr.org",
  "open.demonii.com",
  "exodus.desync.com",
  "explodie.org",
  "tracker.ducks.party",
  "tracker.tamersunion.org",
] as const;

/**
 * Addresses that are not shared Cloudflare/DDoS-Guard endpoints.
 * They are the least risky IPs to try in `--ipset`.
 */
export const ZAPRET_SAFE_IPS = [
  "95.214.235.245",
  "176.58.48.11",
  "198.251.89.38",
  "107.189.29.30",
  "140.82.121.3",
  "208.94.117.187",
] as const;

/**
 * Full snapshot of the A records collected for the app's hosts on 2026-11-17.
 * Includes shared Cloudflare and DDoS-Guard addresses, so it is diagnostic only.
 */
export const ZAPRET_ALL_IPS = [
  ...ZAPRET_SAFE_IPS,

  // Cloudflare
  "104.26.14.71",
  "104.26.15.71",
  "172.67.71.232",
  "188.114.96.3",
  "188.114.97.3",
  "104.21.28.173",
  "172.67.146.237",
  "104.21.4.236",
  "172.67.154.63",
  "104.21.32.39",
  "172.67.182.196",
  "104.21.50.150",
  "172.67.163.237",
  "172.67.209.40",
  "104.21.37.140",
  "104.18.33.196",
  "104.18.40.152",
  "104.18.42.54",
  "104.18.42.163",
  "172.64.145.93",
  "172.64.145.202",
  "172.64.147.104",
  "172.64.154.60",

  // DDoS-Guard
  "186.2.163.197",
  "190.115.16.86",
  "190.115.16.74",
  "190.115.16.16",
  "185.178.208.159",
  "186.2.163.20",

  // Other direct/shared hosts
  "185.199.108.133",
  "185.199.109.133",
  "185.199.110.133",
  "185.199.111.133",
  "62.109.31.142",
  "82.146.61.17",
  "62.109.5.15",
  "93.123.213.192",
  "45.138.8.40",
] as const;

export function zapretLocalEndpoint(port: number): string {
  return `127.0.0.1:${port}`;
}
