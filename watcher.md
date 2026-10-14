# Аудит вотчера (`watcher.md`)

> Дата: 2026-10-14. Файл пишется инкрементально — после каждого пункта дописывается
> новый раздел, чтобы сессию можно было прервать без потери результатов.
> Код/идентификаторы на английском, объяснения — на русском.

## 0. TL;DR

- В проекте есть **три разных «вотчера»**, которые сейчас не связаны между собой:
  1. `src-tauri/src/fswatcher.rs` — реальный файловый вотчер папок библиотеки (notify);
  2. `src-tauri/src/torrent/manager.rs` → `watch_external_files` — отдельная проверка
     «кто-то менял файлы торрента снаружи» (stat-снапшоты, без notify);
  3. фронтовый polling (`liveSync.hook.ts` — торрент раз в 10 с, `folderNotify.hook.ts` —
     раз в 30 мин).
- `src-tauri/src/player/watch.rs` — это **не** файловый вотчер, это сохранение позиции
  просмотра (resume). Название путает, в аудите его не считаем вотчером.
- Отдельного модуля `src/lib/watcher` сейчас **нет**. Логика размазана по
  `src/routes/player.route.tsx` и `src/hooks/player/liveSync.hook.ts`, имя события
  `"folder-content-changed"` захардкожено в двух местах.

---

## 1. Пункт 1 — работает ли вотчер во вкладке плеера везде?

### 1.1. Карта текущей реализации

**Rust, `src-tauri/src/fswatcher.rs`:**

- `FolderWatcher` (строки 11–17) — debouncer + CancellationToken + mpsc-канал «грязных» папок.
- `start()` (строка 28):
  - создаёт `new_debouncer(Duration::from_secs(1), tx)` и вешает каждый root через
    `RecursiveMode::Recursive`;
  - первый `spawn_blocking` (строки 57–70) принимает события debouncer и шлёт в канал
    **parent-папку каждого события** (`event.path.parent()`);
  - второй `tokio::spawn` (строки 75–101) копит папки в `HashSet` и раз в **2 секунды**
    выгребает множество, маппит каждую папку обратно на её watched-root через
    `path.starts_with(root)` и эмитит `"folder-content-changed"` со списком **корней**
    (не изменённых путей!).
- Итоговая задержка события: **debounce 1 с + агрегация 2 с ≈ до 3 секунд**.

Команды в `src-tauri/src/lib.rs`:

```rust
// lib.rs:1036-1052
async fn start_watching_folders(watcher, app_handle, folders: Vec<String>) -> Result<(), String> {
    watcher.lock()?.start(app_handle, folders)
}
async fn stop_watching_folders(watcher) -> Result<(), String> {
    watcher.lock()?.stop(); Ok(())
}
```

Управляемый state регистрируется один раз: `handle.manage(Mutex::new(FolderWatcher::new()))`
(`lib.rs:1529`).

**Frontend, потребители события (оба хардкодят имя):**

1. `src/routes/player.route.tsx:386-443` — обработчик `useTauriEvent<string[]>("folder-content-changed")`.
   Для каждого корня: `queryClient.invalidateQueries({ queryKey: ["extra_files"] })`,
   затем `scan_video_folder` → `refresh_file_index` → пересборка дерева (`setFolderTrees`).
2. `src/hooks/player/liveSync.hook.ts:146-180` — обработчик того же события, но только для
   `watch.kind === "folder"`: снова `scan_video_folder` и `syncDesired(desiredFolderPlaylist(...))`.

Старт вотчера из роута (`player.route.tsx:366-376`):

```tsx
useEffect(() => {
  if (savedFolderPaths.length === 0) return;
  invokeTyped("start_watching_folders", { folders: savedFolderPaths })...
  return () => { invokeTyped("stop_watching_folders")... };
}, [savedFolderPaths, t]);
```

То есть вотчер следит **только за `savedFolderPaths` (папки библиотеки)**.

### 1.2. Как обновляются три разных «списка»

| Список | Где живёт | Как обновляется вотчером |
|---|---|---|
| Дерево папок библиотеки | `player.route.tsx` (`folderTrees`) | Да, rescan корня по событию |
| Live-playlist открытого mpv | `liveSync.hook.ts` | Да, но **только вставка**, только `kind:"folder"` |
| Файлы торрента / upscale-extras | `scan_extra_files` + инвалидация `extra_files` | Косвенно: только если менялась watched-папка |

Живой плейлист mpv (`liveSync.hook.ts`) строится так:
`readPlaylistEntries()` → `planLiveInserts(desired, live, anchor)` → `insertPlaylistFiles`.
`planLiveInserts` (`src/lib/player/livePlaylist.utils.ts`) **умеет только вставлять** —
удаления/перемещения не генерирует. `removePlaylistIndex` в `playback.utils.ts:380` существует,
но из live-sync не вызывается.

UI плейлиста (`src/routes/components/player/media/playlist.player.tsx:205-215`) делает
`refresh()` только когда меняется `playbackAtoms.playlistCount`. Если файл удалён, но
формально остался в mpv-плейлисте, count не меняется → список в UI **не перерисуется**.

### 1.3. Разбор по сценариям (важно для вопроса «везде ли работает»)

**Новый файл** (`ep02.mkv` появился в watched-папке):
- Дерево библиотеки: ✅ — rescan корня, `buildTree` добавляет.
- Live-playlist (folder watch): ✅ — `scan_video_folder` вернёт новый файл, `planLiveInserts`
  его вставит.
- Live-playlist (torrent watch): ⚠️ — fswatcher торрентные save-dir не покрывает; работает
  polling раз в 10 с (`LIVE_TORRENT_POLL_MS`), и **только для файлов торрента**.
- Новый upscale-файл (`*_upscaled*`) в save-dir торрента: ❌ для live-playlist — `checkTorrent`
  вызывает `buildTorrentPlayerPlaylist` **без** `extraFullPaths`, поэтому extras в desired
  не попадают. В UI секции торрента обновление есть, но только через колбэк `onUpscaleDone`
  или ручной refetch (`torrent.player.tsx:33-44`).

**Удалённый файл**:
- Дерево библиотеки: ✅ — `setFolderTrees(prev => prev.filter(...))` убирает корень и
  перестраивает по свежему scan (`player.route.tsx:417-427`).
- Live-playlist: ❌ — синк только вставляет. Файл остаётся в mpv-плейлисте, в UI тоже
  (count не меняется).
- **Особый случай**: если удалён текущий `anchor`, `desiredFolderPlaylist` вернёт `null`,
  и `syncDesired` навсегда ставит `setArmed(false)` (`liveSync.hook.ts:106-113`) — live-sync
  молча выключается до переоткрытия файла. Аналогично после 3 фейлов торрент-поллинга
  (`LIVE_TORRENT_FAIL_LIMIT`).

**Изменённый файл** (перезаписан/перекодирован, путь тот же):
- Дерево библиотеки: ✅ по имени/размеру (rescan).
- Live-playlist: ❌ — путь не изменился, mpv держит уже открытый файл; ничего не перечитывается
  и не перезагружается. Для «показать последний стейт» изменённого файла логики нет.
- Файл, который пишется прямо сейчас (upscale/convert): ⚠️ вотчер отстрелит событие на
  промежуточной записи, rescan прочитает **частичный** размер; в дерево/плейлист может
  попасть недокачанный файл.

### 1.4. Прочие дефекты, найденные в Rust-вотчере

- **Частичный старт**: в `start()` цикл `for path in &paths { debouncer.watcher().watch(...) }`
  использует `?`. Если **любая** папка недоступна (удалена/нет прав), `start` падает и
  **оставшиеся папки не вешаются** вообще. Достаточно одной «битой» папки, чтобы вотчер
  не работал по всей библиотеке.
- **Грубая гранулярность**: событие несёт только корни, а не изменённые пути. Один новый
  файл в корне библиотеки → полный рекурсивный rescan всего корня + `refresh_file_index`
  (что тоже полный обход путей). На большой библиотеке это дорого.
- **Нет фильтра событий**: `Ok(Ok(events)) => for event in events` — обрабатываются и
  `Access`/`Metadata` события, если платформа их шлёт; нет фильтра по kind (create/remove/modify).
- **Двойной debounce**: `new_debouncer(1s)` + свой 2-секундный агрегатор — избыточно и
  увеличивает латентность.
- **Канал `dirty_tx` из `new()` не используется** (строки 19–26): создаётся пара, `rx`
  сразу дропается, поле затирается в `start()`.
- **Остановка**: `stop()` дропает debouncer → `spawn_blocking` получает `Err` и выходит;
  второй task проверяет `debounce_cancel.is_cancelled()` на каждой итерации. Работает, но
  при `tokio::select!` ветка `dirty_rx.recv()` при закрытом канале не матчится и просто
  отключается — выхода нет, но и паники нет (есть ветка sleep). Приемлемо, но хрупко.
- **Torrent save-dir не вотчится**: `start_watching_folders` вызывается только с
  `savedFolderPaths`, а save-dir торрентов туда не входят. Поэтому отдельный механизм
  `watch_external_files` (stat-снапшот + кэш на `PAUSE_WATCH_INTERVAL = 3s`,
  `manager.rs:48,1535-1568`) — это единственное «обнаружение внешних правок» для торрентов,
  и он про pause/finish-бейдж, а не про плейлист.

### 1.5. Вердикт по пункту 1

**Нет, сейчас вотчер работает «везде» не полностью.** Покрытие:

| Сценарий | Дерево библиотеки | Live-playlist (folder) | Live-playlist (torrent) | Upscale-extras |
|---|---|---|---|---|
| Новый файл | ✅ | ✅ | ⚠️ poll 10 с | ⚠️ только колбэк/refetch |
| Удалённый файл | ✅ | ❌ | ❌ | ⚠️ refetch |
| Изменённый файл | ⚠️ (только метаданные) | ❌ | ❌ | ⚠️ refetch |

То есть «новые файлы автоматом появляются» — да (кроме upscale-extras в торрентах).
«Удалённые сразу удаляются из списка рендера» — **нет** для плейлиста mpv, только для
дерева библиотеки. «Изменённые показывают последний стейт» — **нет**.

### 1.6. Вопросы к тебе (пункт 1)

1. «Удалённые сразу удаляются из списка рендера» — речь про **дерево в главном окне**,
   про **mpv-плейлист в окне плеера**, или про оба?
2. Что делать при удалении **текущего** играющего файла: остановить воспроизведение,
   перейти к следующему, или просто убрать из списка?
3. Изменённый (перезаписанный) файл во время проигрывания — надо ли **перезагружать**
   его в mpv (сброс позиции), или достаточно обновить метаданные в списке?
4. Нужно ли вотчить **save-dir торрентов** напрямую (чтобы новые `*_upscaled*` появлялись
   в live-playlist мгновенно, а не через 10-секундный poll)?
5. «Фиксы вотчера для торрента» — имеешь в виду `watch_external_files`/бейдж внешних правок,
   что-то ещё, или конкретный баг? Приведи, пожалуйста, конкретный кейс.

## 2. Пункт 2 — отдельный модуль `src/lib/watcher` + ускорение

### 2.1. Какие конвенции есть в проекте (чтобы модуль был «как остальные»)

- **TS-модули:** `src/lib/<domain>/<name>.utils.ts` (чистые функции), рядом
  `*.config.ts`, хуки — в `src/hooks/<domain>/<name>.hook.ts` (`useTauriEvent`,
  `useLiveResource`, `useCell`). Типы — `src/types/<domain>.d.ts` (плоские `interface`).
  Пример живого плейлиста: `src/lib/player/livePlaylist.utils.ts` +
  `src/hooks/player/liveSync.hook.ts` + `src/types/videoPlayer.d.ts`.
- **Rust-модули:** один файл на подсистему в `src-tauri/src/` (`fswatcher.rs`,
  `file_index.rs`, `video.rs`), либо папка с `mod.rs` (`player/`, `torrent/`).
  Команды объявляются в `lib.rs` и регистрируются в `invoke_handler` (`lib.rs:1807`).
- **Ошибки:** `attempt` / `reportBackgroundError` (TS), `Result<_, String>` (Rust).
- **События:** `useTauriEvent<T>(name, handler, { enabled, errorTag })`.

### 2.2. Предлагаемая структура `src/lib/watcher`

```
src/lib/watcher/
  events.watcher.ts      // FRONTEND: имя события + типизированный payload, один источник правды
  paths.watcher.ts       // normalizePath / samePath / isWithinRoot / rootOf (чистые функции)
  plan.watcher.ts        // diff: classify (created|removed|modified) + planPlaylistOps (insert+remove+move)
  dirty.watcher.ts       // буферизация/дебаунс событий перед обработкой (если нужно на TS)
src/hooks/watcher/
  folders.watcher.hook.ts  // useFolderWatcher(): подписка + rescan + sync, вместо дублей в route/hook
src/types/watcher.d.ts     // FolderWatchEvent, WatchedFolderChange, ChangeKind
```

Rust (по желанию, для чистоты):

```
src-tauri/src/watcher/
  mod.rs        // pub use, реэкспорт
  debounce.rs   // агрегация + фильтр событий notify
  filter.rs     // отсев шума (метаданные/доступ), пути, расширения
  emit.rs       // формирование payload ChangedPath вместо только-корней
```

Что это убирает прямо сейчас (конкретные дубли):

- Два хардкода `"folder-content-changed"` (`player.route.tsx:389`, `liveSync.hook.ts:146`)
  → один `WATCHER_EVENTS.folderContentChanged` + тип `${string}`.
- Две реализации `normalizePath` (`liveSync.hook.ts:24-30` и `livePlaylist.utils.ts:8-10`)
  → один `normalizePath` в `paths.watcher.ts`. Это уже источник багов: lower-case +
  `\`→`/` написано дважды по-разному.
- Логика `planLiveInserts` расширяется до полного reconcile (insert/remove), и её же
  используют и route, и hook.

### 2.3. Ускорение — где сейчас реальные тормоза (по порядку выгоды)

1. **Отдавать изменения, а не корни.** Сейчас payload — список корней, поэтому один новый
   файл в корне = полный рекурсивный обход корня и всего `refresh_file_index`. Надо эмитить
   из Rust **изменённые пути** (`{ path, kind: created|removed|modified }`), а фронт
   инкрементально правит дерево. Это самый большой выигрыш на больших библиотеках.
   Пример Rust-дебаунсера: `notify_debouncer_mini` уже отдаёт `event.path` — терять его
   (`event.path.parent()`, `fswatcher.rs:66`) не обязательно.
2. **Убрать двойной дебаунс.** `new_debouncer(1s)` + 2-секундный агрегатор = до ~3 с
   задержки. Достаточно одного слоя с настраиваемым окном (например 250–500 мс).
3. **Инкрементальный индекс вместо полного.** Сейчас на каждое событие идёт
   `scan_video_folder` + `refresh_file_index` (перезапись индекса и persist в SQLite).
   При наличии changed-paths можно обновлять индекс точечно (add/remove одной записи).
4. **Фильтр событий.** Отбрасывать `Access`/`Metadata`-события и файлы не видео-расширений
   **на стороне Rust** — не будить frontend зря. Фильтр по `EventKind` + `ext_list`.
5. **Параллелизм обхода.** `walk_video_folder` (`lib.rs:490`) уже на `jwalk`, но весь
   `scan_video_folders` идёт **последовательным циклом** по папкам внутри одного
   `spawn_blocking` (`lib.rs:788-820`). Папки можно обрабатывать параллельно (rayon/jwalk)
   с общим семафором, как уже сделано через `FileIndexer::retry_scan_blocking`.
6. **Меньше аллокаций/копий:** `event.path.parent().map(PathBuf::from)`, затем
   `to_string_lossy().to_string()` на каждый корень — можно хранить `PathBuf` и
   сериализовать один раз.
7. **Отдельная «горячая» дорожка для upscale:** файл пишется постепенно; сейчас rescan
   ловит частичный размер. Стоит либо ждать стабилизации размера (два замера mtime/size),
   либо фильтровать временные расширения/`.part` (если пишешь через temp-файл).

### 2.4. Риски / что не ломать

- `folder-scan-progress` используется для прогресса батч-скана (`player.route.tsx:311`);
  инкрементальный rescan не должен ломать батч-индикатор.
- Удаление anchor → `setArmed(false)` — новая reconcile-логика должна корректно
  переживать исчезновение anchor (не терять воспроизведение).
- Windows rename-storms: проводник/антивирус могут слать пачки событий — дебаунс обязателен.
- `refresh_file_index` под `createCoalescedRunner` (защита от `database is locked`) —
  при переходе на точечные апдейты надо сохранить коалесcинг.

### 2.5. Вопросы к тебе (пункт 2)

1. Делать `src/lib/watcher` **только на фронте** (обёртка над текущим Rust-событием), или
   заодно переписать Rust в `src-tauri/src/watcher/` с changed-paths?
2. Инкрементальные апдейты дерева/индекса — сразу в этот рефактор, или отдельным этапом
   после выноса модуля (чтобы не смешивать)?
3. Какой компромисс по задержке/нагрузке: «быстро (250–500 мс)» или «спокойно
   (1–2 с, меньше rescan'ов)»? Настраиваемо?
4. Нужны ли вотчеру и **папки торрентов** (см. вопрос 1.6.4), или торренты оставляем на poll?

## 3. Пункт 3 — что полезного в `solidiquis/erdtree`

### 3.1. Что это

`erdtree` (`erd`) — кросс-платформенная CLI-утилита: многопоточный обход файловой
системы + отчёт о размере (disk usage) в виде дерева/плоского списка. Умеет `.gitignore`,
hidden-файлы, жёсткие/символические ссылки, сортировку, метрики (bytes/blocks/words/lines),
конфиг `.erdtree.toml`, до 10 потоков по умолчанию (`-T`). Это **не вотчер** — это
`du`/`tree`/`find` в одном флаконе, работает по одному проходу, без подписки на события.

### 3.2. Что реально применимо у нас

| Идея из erdtree | Применимость у нас | Комментарий |
|---|---|---|
| Многопоточный обход на `rayon`/`jwalk`, настраиваемое число потоков | ✅ высокая | У нас уже `jwalk` в `walk_video_folder`, но не хватает параллельности и тюна потоков |
| Правила `.gitignore` / hidden на уровне обхода | ⚠️ частично | У нас `.skip_hidden(true)` уже есть; `.gitignore` в видео-библиотеке не нужен, но идея **декларативных правил игнора** (расширения, маски `*.part`, служебные папки) — полезная |
| Дедуп жёстких ссылок при подсчёте размера | ⚠️ опционально | Актуально только если считаем суммарный размер библиотеки; для списка файлов не важно |
| Разные метрики (logical/physical/block) | ⚠️ опционально | Для UI плеера размер файла логический; physical-размер — не приоритет |
| Отсев по regex/glob типу файла | ✅ средняя | Эквивалент нашего `ext_list`; можно взять идею единого матчера расширений |
| Сортировка/лейауты/иконки/LS_COLORS | ❌ | Это терминальный UX, у нас свой UI |
| `.erdtree.toml` / конфиг | ❌ | Дублирование нашей системы настроек |
| Трэдпул как отдельный ресурс с `-T` | ✅ низкая | Если решим параллелить обходы, полезно ограничивать пул семафором, а не плодить потоки per-event |

### 3.3. Вывод по erdtree

Готового кода/паттерна вотчера там нет — брать нечего напрямую. Полезны именно идеи
**параллельного обхода**, **настраиваемого размера пула** и **единых правил игнора** — их
стоит учесть в пункте 2 (ускорение rescan/scan). Копировать конфиг/UI/сортировки смысла нет.

### 3.4. Вопрос

1. Хочешь ли общий «сканер»-пул (rayon) с настраиваемым числом потоков в настройках, или
   оставляем `jwalk`-дефолты и просто параллелим папки внутри одного запроса?

---

## 4. Сводные приоритеты (предложение)

1. **Сначала данные, потом код**: перевести Rust-событие с «корней» на `{path, kind}`
   (create/remove/modify) + фильтр расширений/шума. Без этого любые ускорения на фронте —
   это оптимизация полного rescan'а.
2. **Вынести `src/lib/watcher`** (events/paths/plan) и заменить два дублирующих обработчика
   на один `useFolderWatcher`. Сначала — механическая консолидация, поведение 1:1.
3. **Довести reconcile live-playlist** до insert+remove (использовать существующий
   `removePlaylistIndex`) — закрывает «удалённые сразу пропадают».
4. **Upscale/torrent**: либо явно вотчить save-dir, либо оставить poll, но дотянуть extras
   в `checkTorrent` (передавать `extraFullPaths`).
5. **Скорость**: один дебаунс вместо двух, инкрементальный индекс, параллельный скан;
   при желании — пул потоков `-T`-стиля как у erdtree.

## 4a. Решения по вопросам (ответы от пользователя)

Зафиксировано после аудита:

1. **Удалённые файлы** → чистить **оба** списка: дерево библиотеки и mpv-плейлист.
2. **Удалён текущий играющий файл** → уточнено позже: **как в mpv** (пользователь не уверен,
   выбрал нативное поведение). Файл уходит из списка, а mpv сам переходит на следующий/idle;
   не форсируем стоп и не тянем транспорт назад. (Изначально в решении было «остановить».)
3. **Изменённый (перезаписанный) файл во время игры** → **перезагрузить в mpv**
   (вопрос позиции/сброса времени при перезагрузке — уточнить при реализации).
4. **Torrent save-dir** → **вотчить напрямую**, но только **если нет негативных последствий**.
   - Осторожно: во время активной загрузки торрент пишет много событий (rename/partial),
     а upscale/convert пишет файл постепенно. Обязательно: фильтр событий, ожидание
     стабилизации размера и/или отсев `.part`/временных имён, иначе получим шторм rescan'ов.
   - Если этих мер недостаточно — безопасный fallback: вотчить только **завершённые** торренты
     или оставить poll и дотянуть extras в `checkTorrent`.
5. **Модуль `src/lib/watcher`** → **frontend + переписать Rust** в `src-tauri/src/watcher/`
   (с `changed-paths`).
6. **Инкрементальные апдейты** → **отдельным этапом**, сначала вынос модуля с поведением 1:1.
7. **Задержка** → **настраиваемо**: селект с вариантами «Быстро» и «Спокойно»,
   **дефолт — «Спокойно»**.
8. **Общий rayon-пул** → **да, с настройкой числа потоков** (идея erdtree).

### Следствия для плана

- В reconcile live-playlist добавляется **remove** (`removePlaylistIndex`) и логика
  «стоп, если удалён играющий». Это меняет `livePlaylist.utils.ts` (сейчас только insert).
- Задержка из вопроса 7 делается **настройкой** (новый параметр в `settings.store` +
  UI-селект), а не хардкодом; Rust-дебаунсер должен читать её из payload команды
  `start_watching_folders`.
- Пункт 6 подтверждает порядок: **этап A** — вынос `src/lib/watcher` + Rust `watcher/`
  с `changed-paths`, поведение как сейчас; **этап B** — инкрементальный индекс и ускорения.

---

## 5. Открытые вопросы

Основные вопросы закрыты в разделе 4a, §5.1 — реализацией (см. статус выше). Осталось:

1. ~~При **перезагрузке изменённого файла в mpv** (решение 3) — сохранять текущую
   позицию/паузу/треки или начинать файл с начала?~~ Закрыто: восстанавливаем
   позицию и паузу с watch-позиции.
2. «Фиксы вотчера для торрента» — это `watch_external_files`/бейдж или конкретный баг?
   (нужен кейс, чтобы не чинить существующее).

---

## 6. Этап A — план и ход работ

**Цель:** вынести вотчер в отдельные модули (`src/lib/watcher` + `src-tauri/src/watcher/`),
перевести событие на **changed-paths** (`path` + `root` + `kind`), сохранив видимое
поведение (потребители пока делают тот же полный rescan корня). Инкрементальный индекс,
удаление из плейлиста и настройка задержки — этап B.

**Чек-лист:**

- [x] Определение этапа зафиксировано
- [x] Rust: `src-tauri/src/watcher/mod.rs` вместо `fswatcher.rs`, payload
      `{ roots, changes: [{ path, root, kind }] }`, `kind ∈ created|removed|modified`
      (raw `notify` вместо `notify-debouncer-mini`, агрегация ~1 с)
- [x] Rust: команды `start_watching_folders`/`stop_watching_folders` и имя события
      `folder-content-changed` без изменений (совместимость)
- [x] Frontend: `src/lib/watcher/events.watcher.ts`, `paths.watcher.ts`,
      `src/types/watcher.d.ts`, `src/hooks/watcher/changes.watcher.hook.ts`
- [x] Frontend: единый `useFolderContentChanged` — оба потребителя без хардкода имени
- [x] Тесты: юнит на `paths.watcher`; существующие тесты зелёные

**Итог этапа A (сделано):**

- Rust: `src-tauri/src/watcher/mod.rs` (создан), `src-tauri/src/fswatcher.rs` (удалён),
  `lib.rs` переведён на `mod watcher`. Из `Cargo.toml` убран `notify-debouncer-mini`.
  Заодно поправлен баг частичного старта: недоступная папка теперь логируется, а не
  ломает наблюдение за остальными (ошибка возвращается, только если не удалось ни одну).
- Frontend: `src/types/watcher.d.ts`, `src/lib/watcher/events.watcher.ts`,
  `src/lib/watcher/paths.watcher.ts`, `src/hooks/watcher/changes.watcher.hook.ts`.
- Дубли устранены: `player.route.tsx` и `liveSync.hook.ts` используют
  `useFolderContentChanged`/`changedRoots`/`isSameOrInside`; локальный `normalizePath`
  в `livePlaylist.utils.ts` удалён в пользу `paths.watcher.ts`.
- Проверки: `cargo test --lib watcher` — 6/6 ✅; `bun run typecheck` ✅;
  `vitest` по `paths.watcher` + `liveSync.hook` — 10/10 ✅.
- Поведение сохранено: потребители по-прежнему делают полный rescan корня; удаление из
  плейлиста/инкрементальный индекс — этап B.

**Замечание (важно):** `kind` требует сырых событий `notify` (у `notify-debouncer-mini`
есть только `Any`/`AnyContinuous`). Поэтому этап A заменяет debouncer на собственный
агрегатор, который уже есть. Задержка меняется с ~3 с (1 с debounce + 2 с агрегация) на
~1 с — это допустимо и совпадает с «Быстро», а настраиваемый селект будет в этапе B.

---

## 7. Этап B — очередь работ (накоплено)

1. **Удаление и правка в live-playlist** (решения 1–3): reconcile должен уметь remove
   (`removePlaylistIndex`), а удаление играющего файла — останавливать воспроизведение;
   изменённый во время игры — перезагружать в mpv.
   - [~] **Срез B1 (сделано): удаление из live-playlist.** `planLiveRemovals` в
     `livePlaylist.utils.ts` + remove в `reconcile` (`liveSync.hook.ts`) с перечитыванием
     плейлиста. Удаляются только пути, которые были в предыдущем плане, — файлы,
     добавленные рукой, не трогаем.
     - По вопросу «удалён играющий файл»: выбран вариант **как в mpv** (пользователь не уверен,
       выбрал нативное поведение). mpv сам уходит на следующий/в idle, а `reconcile`
       не тянет транспорт назад к удалённому файлу (`removedPaths` — проверка перед restore).
     - Проверки: `typecheck` ✅, `oxlint` ✅, `vitest` по `livePlaylist.utils` + `liveSync.hook`
       — 21/21 ✅.
   - [x] **Сделано: перезагрузка изменённого играющего файла.** `useLivePlaylistSync`
     принимает `{ onPlayingFileModified }`; при `kind === "modified"` для текущего
     пути вызывает колбэк. `player.component.tsx` передаёт `reloadPlayingFile`,
     который через `hwdecReloadRef` + `playPlaylistIndex` переоткрывает файл и
     восстанавливает позицию/паузу (то есть «с watch-позиции»). Тесты в
     `liveSync.hook.test.tsx`.
2. **Инкрементальный индекс**: использовать `changes[]` (уже в payload) для точечного
   обновления дерева/индекса вместо полного rescan корня.
   - [x] **Сделано (частично): отсев ненужных rescan.** `touchesExtensions`
     (`src/lib/watcher/changes.watcher.ts`): если в батче нет ни одного видео-
     расширения, `player.route` и `liveSync` пропускают полный rescan корня.
     Тесты: `changes.watcher.test.ts` + кейс в `liveSync.hook.test.tsx`.
   - [x] **Сделано: точечное обновление дерева/индекса без обхода корня.**
     - Rust: `FileIndexer::apply_paths(upserts, removals, extensions)` перечитывает
       только перечисленные пути (проверка расширения + `is_file`), выкидывает
       тронированные записи и возвращает свежие `FileEntry`; генерация
       `rebuild_generation` — как у `refresh`, чтобы гоняющиеся полный rebuild
       перекрывал точечный апдейт. Команда `update_file_index_paths` пишет в SQLite
       только затронутые строки одной транзакцией (`upsert_unified_index_batch` +
       новый `app_db::delete_unified_index_ids_inner`) — без перезаписи всего scope,
       как делает `persist_file_index`.
     - Frontend: `patchTreeFile` / `removeTreeFile` в `src/lib/player/tree.utils.ts`
       строят ровно узлы на пути файла (структурное копирование, `null` = путь не
       под этим корнем), плюс `allFilePaths` для снапшота уведомлений.
     - `player.route.tsx` делит батч события по корням: пачка только из видео-файлов
       → `update_file_index_paths` + патч дерева; смешанная пачка (папка создана/
       переименована/удалена, `.nfo`, файл без расширения) → прежний полный
       `refresh_file_index`. Логика принятия решения вынесена в чистую функцию
       `patchableVideoChanges` (`changes.watcher.ts`), фолбэк при ошибке команды или
       при пути вне корня — полный rescan того же корня.
     - Тесты: `file_index::tests::apply_paths_updates_single_entries_without_walking_the_root`,
       `src/tests/lib/player/tree.utils.test.ts` (8), `patchableVideoChanges` в
       `src/tests/lib/watcher/changes.watcher.test.ts` (8 всего в файле).
3. **Настраиваемая задержка**: селект «Быстро»/«Спокойно» (дефолт «Спокойно») — параметр
   в `start_watching_folders` + настройка + UI.
   - [x] **Сделано.** Настройка `watcherDelay: "fast" | "calm"` (дефолт `calm`) в
     `src/types/settings.d.ts`, `defaults.config.ts`, валидатор + `SETTINGS_SCHEMA_VERSION 46→47`
     в `settings.store.ts` (+ `TRACKED_STORES`/тест-фикстура миграций). Маппинг в окно:
     `src/lib/watcher/delay.watcher.ts` (`fast: 400 ms`, `calm: 1500 ms`). UI — селект в
     `media.settings.tsx`; i18n en/ru; ключи добавлены в `find.utils.ts`. Rust:
     `start_watching_folders(…, debounce_ms)` + кламп `100..10_000`, дефолт 1500.
   - Проверки: `typecheck` ✅, `oxlint` ✅, `migrations.utils.test` ✅, полный сьют —
     3059 passed / 1 pre-existing fail, `cargo test --lib watcher` 6/6 ✅, `cargo clippy` по
     watcher — 0.
4. **Общий rayon-пул** с настраиваемым числом потоков (идея erdtree).
   - [x] **Сделано.** Все обходы теперь идут на выделенном пуле `scan-N`, а не на
     глобальном rayon-пуле, который делится с хешированием торрентов (там jwalk
     падал после 1-секундного handshake'а с `rayon thread-pool too busy`, отсюда
     `retry_scan_blocking` + `scan_slot`). Пул один на процесс, пересоздаётся только
     при смене размера (`FileIndexer::scan_parallelism`), `busy_timeout: None` —
     обход гонится с блокирующей таски, а не с пула, поэтому ожидание вместо
     дедлока. Настройка `scanThreads` (0 = авто = числу ядер, иначе кламп `2..=64`):
     `settings.d.ts` + `defaults.config.ts` + валидатор + `SETTINGS_SCHEMA_VERSION 47→48`
     (+ `TRACKED_STORES`), селект в `media.settings.tsx`, i18n en/ru, ключи в
     `find.utils.ts`. Параметр `threads` принимают `scan_video_folder(s)`,
     `rebuild_file_index`, `refresh_file_index`, `update_file_index_paths` (для
     старых вызовов без параметра — `None` = авто). Зависимость `rayon = "1"`
     добавлена прямой (уже была в lockfile через jwalk).
5. **Вотчинг torrent save-dir** (с anti-partial/фильтром) либо fallback на poll.
   - [x] **Сделано.** `player.route.tsx` слушает `savedFolderPaths` + все save-dir
     активных торрентов (`torrentSaveDirsKey` → `watchedRoots`). Обработчик фильтрует
     по `libraryRoots`: для папок идёт рескан/патч дерева, для торрент-дирректорий —
     только инвалидация `extra_files`-запросов (upscale/convert пишутся рядом с
     файлами), чтобы торрент-дирректория не превращалась в папку библиотеки.
    - [x] **Сделано: паритет live-playlist торрентов с папками.** `liveSync.hook.ts`
      подписан на события и для `kind: "torrent"`: изменения в `saveDir` сразу
      запускают `checkTorrent` (не ждём 10-секундный poll; poll остаётся фолбэком),
      тот же reconcile insert+remove, тот же пропуск не-видео батчей
      (`touchesExtensions`). Перезагрузка изменённого играющего файла — только для
      стабильного (полностью скачанного) торрента: качающийся файл шлёт `modified`
      постоянно, перезагружать его было бы безумием. Тесты: 4 новых кейса в
      `liveSync.hook.test.tsx` (немедленный чек по событию, игнор чужой папки,
      reload стабильного, отказ при качающемся).
6. **Батчинг поллинга в player route** (запрос пользователя): сейчас опрос идёт
   отдельными вызовами на каждую папку/торрент
   (`scan_video_folders`/`get_running_torrent_files`/`useTorrentFilesMap`). Нужен один
   батч-запрос на все папки и торренты за тик, чтобы не плодить «миллион запросов».
   - Для дебаунса/задержек использовать существующий модуль `src/lib/pacer`
     (пользователь напомнил) вместо ручных таймеров.
   - [x] **Сделано (частично).** Оказалось, что поллинг уже батчится: торренты —
     `runningTorrentFilesBatch`, папки — `scan_video_folders` (один вызов на все пути),
     а `liveSync` для торрента опрашивает только открытый торрент. Осталась **первичная
     загрузка файлов торрентов**: `useTorrentFilesMap` делала отдельный
     `runningTorrentFiles(id)` на каждый торрент при монтировании. Теперь при включённом
     поллинге per-id запросы отключены, и кэш заполняет один батч-свип
     (`src/hooks/torrent/queries.hook.ts`). Тест: `src/tests/hooks/torrent/queries.hook.test.tsx`.
   - [x] **Сделано (опц. из 6b): rescan папок и liveSync — один батч-запрос на тик.**
     `src/lib/player/scanBus.utils.ts`: шина сканов на `pacer.Debouncer`
     (`wait 50 ms`, `maxWait 500 ms`; ручных таймеров нет). Оба потребителя события
     `folder-content-changed` (роут и live-playlist) теперь просят шину, а не вызывают IPC
     напрямую: корни складываются за тик, дубли схлопываются, и уходит один вызов
     `refresh_file_index` на все корни (он же обновляет индекс и отдаёт свежие записи
     обоим потребителям). Правила:
     - корень, о который просят и полный rescan, и точечный апдейт, проходится **один** раз,
       точечный апдейт пропускается — гонки walk/point-update на одном корне не бывает;
     - патч-подписчик, получивший полный проход, перестраивает дерево (`kind: "full"`),
       а не патчит узлы;
     - корни разных типов (полный проход vs только патч) идут разными вызовами и падают
       независимо.
     Потребители: `player.route.tsx` (`rescanPath`/`patchRoot`) и `liveSync.hook.ts`
     (филадельфийская ветка). Тесты: `src/tests/lib/player/scanBus.utils.test.ts` (8),
     `liveSync.hook.test.tsx` переведён на `refresh_file_index` + ожидание тика.
   - **Попутная починка гонки в Rust:** `FileIndexer::refresh` при перекрытии более новым
     rebuild/point-update раньше возвращал пусто — роут удалял дерево папки, а плейлист
     сносился в пустоту. Теперь индекс оставляет более новым, а вызывающему отдаёт
     результат своего обхода. Тест:
     `refresh_returns_its_walk_when_a_point_update_supersedes_it` (tokio + `futures::poll!`).

7. **Пользовательские заметки из переписки (учтено):** дебаунс/задержки делать через
   `src/lib/pacer`, а не ручными таймерами.

---

## 8. Статус этапа B (проверки)

| Пункт | Статус |
| --- | --- |
| 1. Remove/modify в live-playlist | [x] |
| 2. Инкрементальный индекс (точечный апдейт) | [x] |
| 3. Настраиваемая задержка `watcherDelay` | [x] |
| 4. Общий rayon-пул с настройкой потоков `scanThreads` | [x] |
| 5. Вотчинг torrent save-dir | [x] |
| 6. Батчинг поллинга | [x] (батч-свип + scanBus на тик) |
| 6b. Один батч-запрос на тик для папок + liveSync | [x] (`scanBus.utils.ts`) |

**Закрыт вопрос §5.1:** при перезагрузке изменённого играющего файла позиция и пауза
восстанавливаются («с watch-позиции», `reloadPlayingFile` через `hwdecReloadRef` +
`playPlaylistIndex`). Треки берутся из сохранённого состояния файла; отдельного
выбора «с начала» не делаем.

**Паритет торрентов в плеере (по уточнению пользователя):** вотчер работает одинаково
для папок и торрентов — событие в `saveDir` сразу запускает `checkTorrent`
(`liveSync.hook.ts`), modified-reload играющего файла только для стабильного торрента,
upscale-extras из save-dir входят в desired плейлиста (читаются из `extraFiles`-кэша
с предварительным refetch на том же событии).

**Вотчер в торрент-руте:** событие в save-dir торрента запускает таргетный батч-свип
только для затронутых торрентов (`requestRefresh` в `useTorrentFilesMap`), вместо
ожидания 5-секундного тика. Poll остаётся фолбэком. Тест: `queries.hook.test.tsx`
(немедленный таргетный батч).

**Последний прогон:** `cargo test --lib` 421/421 ✅; `cargo clippy --all-targets` —
0 предупреждений в `file_index.rs`, `lib.rs`, `app_db/unified_index.rs` ✅;
`bun run typecheck` ✅; `oxlint --type-aware` по затронутым файлам 0/0 ✅;
`oxfmt --check` по ним ✅; полный `vitest run` — 3101 passed / 1 failed
(`settings/find.utils.test.ts`, `settings.keybinds.record.*` — чужой незакоммиченный
WIP по клавиатурам, к вотчеру отношения не имеет). `bun run lint` — 3 ошибки в файлах,
которых вотчер не трогал (`animatedNumber.component.tsx`, `quickAdd.hook.test.tsx`).

**Не сделано (осознанно):** настоящий интеграционный тест Tauri-команды
`update_file_index_paths` — гидратация команд в тестовой среде невозможна.
Вместо этого покрыта IPC-проводка: `scanExecutors` через мок `invoke`
(`scanBus.utils.test.ts`, блок default executors) проверяет имена команд и
аргументы `refresh_file_index` / `update_file_index_paths`; логика индекса —
Rust-тест `apply_paths`, патч дерева и стратегия — соответствующие vitest.
