use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;

#[cfg(windows)]
const INVALID_FILE_SIZE: u32 = 0xFFFF_FFFF;

#[cfg(windows)]
extern "system" {
    fn GetFileAttributesW(name: *const u16) -> u32;
    fn SetFileAttributesW(name: *const u16, attributes: u32) -> i32;
    fn GetCompressedFileSizeW(name: *const u16, size_high: *mut u32) -> u32;
    fn GetLastError() -> u32;
    fn DeviceIoControl(
        device: isize,
        control_code: u32,
        in_buffer: *const u8,
        in_size: u32,
        out_buffer: *mut u8,
        out_size: u32,
        returned: *mut u32,
        overlapped: *const u8,
    ) -> i32;
}

#[cfg(windows)]
fn wide(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
pub fn is_hidden(path: &Path) -> bool {
    let attributes = unsafe { GetFileAttributesW(wide(path).as_ptr()) };
    attributes != u32::MAX && attributes & FILE_ATTRIBUTE_HIDDEN != 0
}

#[cfg(not(windows))]
pub fn is_hidden(_path: &Path) -> bool {
    false
}

#[cfg(windows)]
pub fn hide_file(path: &Path) {
    let name = wide(path);
    let attributes = unsafe { GetFileAttributesW(name.as_ptr()) };
    if attributes == u32::MAX || attributes & FILE_ATTRIBUTE_HIDDEN != 0 {
        return;
    }
    unsafe {
        SetFileAttributesW(name.as_ptr(), attributes | FILE_ATTRIBUTE_HIDDEN);
    }
}

#[cfg(not(windows))]
pub fn hide_file(_path: &Path) {}

#[cfg(windows)]
pub fn unhide_file(path: &Path) {
    let name = wide(path);
    let attributes = unsafe { GetFileAttributesW(name.as_ptr()) };
    if attributes == u32::MAX || attributes & FILE_ATTRIBUTE_HIDDEN == 0 {
        return;
    }
    unsafe {
        SetFileAttributesW(name.as_ptr(), attributes & !FILE_ATTRIBUTE_HIDDEN);
    }
}

#[cfg(not(windows))]
pub fn unhide_file(_path: &Path) {}

#[cfg(windows)]
pub fn allocated_bytes(path: &Path) -> Option<u64> {
    let mut high = 0u32;
    let low = unsafe { GetCompressedFileSizeW(wide(path).as_ptr(), &raw mut high) };
    if low == INVALID_FILE_SIZE && unsafe { GetLastError() } != 0 {
        return None;
    }
    Some((u64::from(high) << 32) | u64::from(low))
}

#[cfg(unix)]
pub fn allocated_bytes(path: &Path) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(path).ok().map(|meta| meta.blocks() * 512)
}

#[cfg(not(any(windows, unix)))]
pub fn allocated_bytes(_path: &Path) -> Option<u64> {
    None
}

fn cache() -> &'static Mutex<HashMap<PathBuf, bool>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, bool>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn volume_root(path: &Path) -> PathBuf {
    path.ancestors()
        .filter(|ancestor| !ancestor.as_os_str().is_empty())
        .last()
        .unwrap_or(path)
        .to_path_buf()
}

#[cfg(windows)]
fn set_sparse(handle: isize) -> bool {
    let mut returned = 0u32;
    let result = unsafe {
        DeviceIoControl(
            handle,
            0x0009_00C4,
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            0,
            &raw mut returned,
            std::ptr::null(),
        )
    };
    result != 0
}

#[cfg(windows)]
pub fn mark_sparse(file: &std::fs::File) -> bool {
    use std::os::windows::io::AsRawHandle;
    set_sparse(file.as_raw_handle() as isize)
}

#[cfg(not(windows))]
pub fn mark_sparse(_file: &std::fs::File) -> bool {
    true
}

#[cfg(windows)]
fn probe_sparse(dir: &Path) -> bool {
    let probe = dir.join(".iluha-sparse-probe");
    let _ = std::fs::remove_file(&probe);
    let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&probe)
    else {
        return false;
    };
    let supported = mark_sparse(&file);
    drop(file);
    let _ = std::fs::remove_file(&probe);
    supported
}

#[cfg(not(windows))]
fn probe_sparse(dir: &Path) -> bool {
    let probe = dir.join(".iluha-sparse-probe");
    let supported = std::fs::write(&probe, b"probe").is_ok();
    let _ = std::fs::remove_file(&probe);
    supported
}

pub fn sparse_capable(path: &Path) -> bool {
    let root = volume_root(path);
    if let Ok(cache) = cache().lock() {
        if let Some(known) = cache.get(&root) {
            return *known;
        }
    }
    let probe_dir = crate::torrent::helpers::existing_parent(path).unwrap_or(root.as_path());
    let supported = probe_sparse(probe_dir);
    if let Ok(mut cache) = cache().lock() {
        cache.insert(root, supported);
    }
    supported
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("iluha-disk-{}-{label}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[cfg(windows)]
    #[test]
    fn hiding_and_unhiding_preserves_the_other_attributes() {
        let dir = temp_dir("hidden");
        let file = dir.join("episode.mkv");
        std::fs::write(&file, b"data").expect("write file");
        let before = unsafe { GetFileAttributesW(wide(&file).as_ptr()) };

        hide_file(&file);
        assert!(is_hidden(&file));
        let hidden = unsafe { GetFileAttributesW(wide(&file).as_ptr()) };
        assert_eq!(
            hidden & !FILE_ATTRIBUTE_HIDDEN,
            before & !FILE_ATTRIBUTE_HIDDEN
        );

        hide_file(&file);
        assert!(is_hidden(&file));

        unhide_file(&file);
        assert!(!is_hidden(&file));
        let after = unsafe { GetFileAttributesW(wide(&file).as_ptr()) };
        assert_eq!(after, before);

        unhide_file(&file);
        assert!(!is_hidden(&file));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn allocated_size_stays_near_the_written_bytes_on_a_sparse_file() {
        use std::io::{Seek, SeekFrom, Write};
        let dir = temp_dir("sparse");
        if !sparse_capable(&dir) {
            let _ = std::fs::remove_dir_all(&dir);
            return;
        }
        let file = dir.join("partial.mkv");
        let mut handle = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&file)
            .expect("create file");
        assert!(mark_sparse(&handle), "the probe volume is sparse-capable");
        handle.set_len(512 * 1024 * 1024).expect("set length");
        handle.seek(SeekFrom::Start(0)).expect("seek");
        handle.write_all(&vec![7u8; 1024 * 1024]).expect("write");
        handle.sync_all().expect("flush");
        let allocated_while_open = allocated_bytes(&file).expect("allocated size");
        drop(handle);
        assert!(allocated_while_open >= 1024 * 1024);

        let allocated = allocated_bytes(&file).expect("allocated size");
        assert!(
            allocated < 512 * 1024 * 1024 / 2,
            "a sparse file must not allocate its logical length, got {allocated}"
        );
        assert!(allocated >= 1024 * 1024, "allocated = {allocated}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_file_opened_with_the_engine_share_mode_can_still_be_marked_sparse() {
        use std::io::{Seek, SeekFrom, Write};
        use std::os::windows::fs::OpenOptionsExt;

        let dir = temp_dir("sparse-share");
        if !sparse_capable(&dir) {
            let _ = std::fs::remove_dir_all(&dir);
            return;
        }
        let file = dir.join("engine.mkv");
        let mut handle = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            // The engine opens the payload with FILE_SHARE_DELETE so the
            // finished `.part` can be renamed over the final name.
            .share_mode(0x7)
            .open(&file)
            .expect("create file");
        assert!(
            mark_sparse(&handle),
            "the engine share mode must not block the sparse flag"
        );
        handle.set_len(512 * 1024 * 1024).expect("set length");
        handle.seek(SeekFrom::Start(0)).expect("seek");
        handle.write_all(&vec![7u8; 1024 * 1024]).expect("write");
        handle.sync_all().expect("flush");
        let allocated = allocated_bytes(&file).expect("allocated size");
        assert!(
            allocated < 512 * 1024 * 1024 / 2,
            "a sparse file must not allocate its logical length, got {allocated}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_file_open_with_the_engine_share_mode_can_still_be_hidden_and_revealed() {
        use std::os::windows::fs::OpenOptionsExt;

        let dir = temp_dir("hidden-share");
        let file = dir.join("episode.mkv.part");
        let handle = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            // The engine holds the payload open with FILE_SHARE_DELETE.
            .share_mode(0x7)
            .open(&file)
            .expect("create file");

        hide_file(&file);
        assert!(
            is_hidden(&file),
            "the engine share mode must not block the hidden flag"
        );
        unhide_file(&file);
        assert!(!is_hidden(&file));

        drop(handle);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_files_have_no_allocation() {
        let dir = temp_dir("missing");
        assert_eq!(allocated_bytes(&dir.join("nope.mkv")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn volume_root_is_stable_for_nested_paths() {
        let root = volume_root(Path::new("C:/Anime/Show/Season 1"));
        assert_eq!(root, volume_root(Path::new("C:/Anime")));
        assert_eq!(root, PathBuf::from("C:/"));
    }
}
