//! Memory and allocation measurements for long-lived backend representations.
//!
//! `cargo test --lib mem_layout -- --nocapture` prints the table this module
//! asserts on. The numbers are budgets: a representation that grows past them
//! should either be optimized or the budget raised deliberately.

/// Allocation accounting for the tests below.
///
/// Counters are thread local, so tests running in parallel do not pollute each
/// other, and they are const-initialized so recording an allocation never
/// allocates itself.
#[cfg(test)]
pub mod counting {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::cell::Cell;

    pub struct CountingAlloc;

    thread_local! {
        static ENABLED: Cell<bool> = const { Cell::new(false) };
        static ALLOCS: Cell<u64> = const { Cell::new(0) };
        static BYTES: Cell<usize> = const { Cell::new(0) };
        static LIVE: Cell<isize> = const { Cell::new(0) };
    }

    #[derive(Debug, Clone, Copy, Default)]
    pub struct Stats {
        pub allocs: u64,
        pub bytes: usize,
        pub live_bytes: isize,
    }

    fn record(size: usize) {
        ALLOCS.with(|cell| cell.set(cell.get() + 1));
        BYTES.with(|cell| cell.set(cell.get() + size));
        LIVE.with(|cell| cell.set(cell.get() + size as isize));
    }

    fn release(size: usize) {
        LIVE.with(|cell| cell.set(cell.get() - size as isize));
    }

    unsafe impl GlobalAlloc for CountingAlloc {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            // SAFETY: forwarding the layout to the system allocator.
            let pointer = unsafe { System.alloc(layout) };
            if !pointer.is_null() && ENABLED.with(Cell::get) {
                record(layout.size());
            }
            pointer
        }

        unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
            // SAFETY: forwarding the layout to the system allocator.
            let pointer = unsafe { System.alloc_zeroed(layout) };
            if !pointer.is_null() && ENABLED.with(Cell::get) {
                record(layout.size());
            }
            pointer
        }

        unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
            if ENABLED.with(Cell::get) {
                release(layout.size());
            }
            // SAFETY: the pointer came from this allocator with this layout.
            unsafe { System.dealloc(pointer, layout) }
        }

        unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
            // SAFETY: forwarding the pointer and layouts to the system allocator.
            let moved = unsafe { System.realloc(pointer, layout, new_size) };
            if !moved.is_null() && ENABLED.with(Cell::get) {
                release(layout.size());
                record(new_size);
            }
            moved
        }
    }

    /// Runs `run` with allocation accounting enabled on the calling thread.
    pub fn measure<T>(run: impl FnOnce() -> T) -> (T, Stats) {
        ALLOCS.with(|cell| cell.set(0));
        BYTES.with(|cell| cell.set(0));
        LIVE.with(|cell| cell.set(0));
        ENABLED.with(|cell| cell.set(true));
        let value = run();
        ENABLED.with(|cell| cell.set(false));
        let stats = Stats {
            allocs: ALLOCS.with(Cell::get),
            bytes: BYTES.with(Cell::get),
            live_bytes: LIVE.with(Cell::get),
        };
        (value, stats)
    }
}

#[cfg(test)]
#[global_allocator]
static GLOBAL_ALLOCATOR: counting::CountingAlloc = counting::CountingAlloc;

#[cfg(test)]
mod tests {
    use super::counting::{measure, Stats};
    use crate::file_index::FileEntry;
    use std::mem::size_of;

    /// File counts small enough to keep the suite fast, large enough for the
    /// per-entry numbers to be meaningful.
    const FILES: usize = 10_000;

    /// Paths shaped like a real anime library: long, nested, with a season and
    /// a release-group prefix on the file name.
    fn sample_paths(count: usize) -> Vec<String> {
        (0..count)
            .map(|index| {
                format!(
                    "D:/Anime/Show {:03}/Season {}/[SubsPlease] Show {:03} - {:02} [1080p].mkv",
                    index % 120,
                    index % 12 + 1,
                    index % 120,
                    index % 48 + 1
                )
            })
            .collect()
    }

    fn per_entry(stats: Stats, count: usize) -> (f64, f64) {
        let count = count as f64;
        (stats.allocs as f64 / count, stats.live_bytes as f64 / count)
    }

    #[test]
    fn reports_the_layout_of_transient_models() {
        use crate::anilist::franchise::CachedFranchiseNode;
        use crate::anilist::media::AniMedia;
        use crate::scrapers::clients::NyaaItem;
        use crate::scrapers::details::{DescriptionBlock, TorrentDetails};
        use crate::stream::anime_lib_models::{AnimeLibAnime, StreamVariant};
        use crate::torrent::types::{TorrentFileInfo, TorrentInfo};

        println!(
            "models: AniMedia={} TorrentDetails={} DescriptionBlock={} StreamVariant={} \
             AnimeLibAnime={} CachedFranchiseNode={} TorrentInfo={} TorrentFileInfo={} NyaaItem={}",
            size_of::<AniMedia>(),
            size_of::<TorrentDetails>(),
            size_of::<DescriptionBlock>(),
            size_of::<StreamVariant>(),
            size_of::<AnimeLibAnime>(),
            size_of::<CachedFranchiseNode>(),
            size_of::<TorrentInfo>(),
            size_of::<TorrentFileInfo>(),
            size_of::<NyaaItem>(),
        );
        // The UI models are trimmed on the way out, not stored, so the only
        // thing worth guarding is that none of them wraps a giant variant.
        assert!(size_of::<TorrentDetails>() < 512);
        assert!(size_of::<AniMedia>() < 1024);
    }

    #[test]
    fn reports_the_file_index_layout() {
        let paths = sample_paths(FILES);
        assert_eq!(paths.len(), FILES);
        let (entries, stats) = measure(|| {
            let mut entries: Vec<FileEntry> = Vec::with_capacity(1024);
            for path in &paths {
                entries.push(FileEntry::new(path.as_str(), 1));
            }
            entries
        });
        let (allocs, bytes) = per_entry(stats, FILES);
        println!(
            "file_index: size_of={} inline={} allocs/entry={allocs:.2} live/entry={bytes:.1}B \
             capacity={} len={}",
            size_of::<FileEntry>(),
            size_of::<FileEntry>() * entries.capacity(),
            entries.capacity(),
            entries.len()
        );
        assert_eq!(entries.len(), FILES);
        assert!(
            size_of::<FileEntry>() <= 40,
            "FileEntry grew to {} bytes",
            size_of::<FileEntry>()
        );
        assert!(allocs <= 2.1, "build allocates {allocs} times per entry");
        assert!(bytes <= 180.0, "index keeps {bytes} bytes per entry");

        // The rebuild shrinks the walk's vector before storing it, so the
        // stored index carries no spare capacity.
        let mut stored = entries;
        stored.shrink_to_fit();
        println!(
            "file_index stored: capacity={} inline={}B",
            stored.capacity(),
            stored.capacity() * size_of::<FileEntry>()
        );
        assert_eq!(stored.capacity(), FILES);
    }
}
