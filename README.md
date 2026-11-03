<h1 align="center">iluhaAnime</h1>

<p align="center">
  <b>Anime Torrent & Tracker</b>
  <b>(English and Russian localization)</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"/></a>
  <img src="https://img.shields.io/badge/version-2.x-blue" alt="Version 2.x"/>
  <img src="https://img.shields.io/badge/Tauri-2-blueviolet" alt="Tauri 2"/>
  <img src="https://img.shields.io/badge/React-19-61dafb" alt="React 19"/>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform: Windows"/>
</p>

---

## Screenshots

<img width="720" height="480" alt="image" src="https://github.com/user-attachments/assets/5f53754c-80c4-46f2-b86d-3edef2668914" />
<img width="720" height="480" alt="image" src="https://github.com/user-attachments/assets/3c02e12f-5d56-496c-8ddc-7d95b190c0bb" />
<img width="720" height="480" alt="image" src="https://github.com/user-attachments/assets/3e3f37ea-57f4-42ae-bb46-99055b28b9b6" />
<img width="720" height="480" alt="image" src="https://github.com/user-attachments/assets/58b964ad-3332-41f4-b2e1-1be06314bcac" />

---

## Bundled data

Regenerate with `bun run data:geoip` and `bun run data:flags`.

- Peer-country lookups use the [DB-IP Lite](https://db-ip.com) country database, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Packed into `src-tauri/data/geoip-v1.bin.gz` by `scripts/build-geoip.ts`.
- Country flag tiles are [flag-icons](https://github.com/lipis/flag-icons) art (MIT), fetched as 16x12 PNGs from [flagcdn.com](https://flagcdn.com) and packed into one `public/images/flags.sprite.png` spritesheet by `scripts/build-flags.ts`.

## Torrent proxy and zapret

Torrent traffic can go through an HTTP or SOCKS5 proxy from **Settings → Proxy → Torrent proxy**. The proxy applies after an app restart; the settings page shows which proxy the running session is actually using.

Only TCP peers and HTTP(S) trackers go through the proxy. DHT, UDP trackers, uTP and incoming connections stay direct, and DHT/UPnP are disabled automatically while a proxy is set, so no direct connections are made.

If you use [zapret](https://github.com/Flowseal/zapret-discord-youtube) and downloads stall or the built-in browser cannot open Rutracker:

- Prefer an HTTP proxy (`http://127.0.0.1:7890`) when your proxy offers one; HTTP CONNECT is supported for peers and trackers.
- Make sure zapret does not filter the proxy port or localhost traffic, and disable Game Filter while testing.
- Do not run two zapret instances at once.
- Enable the webview proxy toggle in **Settings → Proxy** for the built-in browser.

## License

[MIT](LICENSE) © HullPerse
