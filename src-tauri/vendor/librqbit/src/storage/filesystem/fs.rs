use std::{
    fs::OpenOptions,
    io::IoSlice,
    path::{Path, PathBuf},
};

use anyhow::Context;
use tracing::warn;

use crate::{
    storage::{StorageFactoryExt, filesystem::opened_file::OurFileExt},
    torrent_state::{ManagedTorrentShared, TorrentMetadata},
};

use crate::storage::{StorageFactory, TorrentStorage};

use super::opened_file::OpenedFile;

#[derive(Default, Clone, Copy)]
pub struct FilesystemStorageFactory {}

impl StorageFactory for FilesystemStorageFactory {
    type Storage = FilesystemStorage;

    fn create(
        &self,
        shared: &ManagedTorrentShared,
        _metadata: &TorrentMetadata,
    ) -> anyhow::Result<FilesystemStorage> {
        Ok(FilesystemStorage {
            output_folder: shared.options.output_folder.clone(),
            opened_files: Default::default(),
            file_paths: Default::default(),
        })
    }

    fn clone_box(&self) -> crate::storage::BoxStorageFactory {
        self.boxed()
    }
}

pub struct FilesystemStorage {
    pub(crate) output_folder: PathBuf,
    pub(crate) opened_files: Vec<OpenedFile>,
    pub(crate) file_paths: Vec<PathBuf>,
}

fn with_part_suffix(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".part");
    PathBuf::from(name)
}

fn open_file(path: &Path, allow_overwrite: bool) -> anyhow::Result<std::fs::File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Renaming while a peer writes requires FILE_SHARE_DELETE on both
        // handles; without it Windows fails the rename with a sharing violation.
        options.share_mode(0x0000_0007);
    }
    if !allow_overwrite && !path.exists() {
        let mut create = OpenOptions::new();
        create.write(true).create_new(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            create.share_mode(0x0000_0007);
        }
        create
            .open(path)
            .with_context(|| format!("error creating {path:?}"))?;
    } else if allow_overwrite {
        options.create(true).truncate(false);
    }
    options
        .open(path)
        .with_context(|| format!("error opening {path:?} in read/write mode"))
}

impl FilesystemStorage {
    #[allow(dead_code)]
    pub(crate) fn take_fs(&self) -> anyhow::Result<Self> {
        Ok(Self {
            opened_files: self
                .opened_files
                .iter()
                .map(|f| f.take_clone())
                .collect::<anyhow::Result<Vec<_>>>()?,
            output_folder: self.output_folder.clone(),
            file_paths: self.file_paths.clone(),
        })
    }
}

impl TorrentStorage for FilesystemStorage {
    fn pread_exact(&self, file_id: usize, offset: u64, buf: &mut [u8]) -> anyhow::Result<()> {
        self.opened_files
            .get(file_id)
            .context("no such file")?
            .lock_read()?
            .pread_exact(offset, buf)
    }

    fn pwrite_all(&self, file_id: usize, offset: u64, buf: &[u8]) -> anyhow::Result<()> {
        let of = self.opened_files.get(file_id).context("no such file")?;
        #[cfg(windows)]
        return of.try_mark_sparse()?.pwrite_all(offset, buf);
        #[cfg(not(windows))]
        return of.lock_read()?.pwrite_all(offset, buf);
    }

    fn pwrite_all_vectored(
        &self,
        file_id: usize,
        offset: u64,
        bufs: [IoSlice<'_>; 2],
    ) -> anyhow::Result<usize> {
        let of = self.opened_files.get(file_id).context("no such file")?;
        #[cfg(windows)]
        return of.try_mark_sparse()?.pwrite_all_vectored(offset, bufs);
        #[cfg(not(windows))]
        return of.lock_read()?.pwrite_all_vectored(offset, bufs);
    }

    fn remove_file(&self, file_id: usize, filename: &Path) -> anyhow::Result<()> {
        let final_path = self.output_folder.join(filename);
        let part_path = with_part_suffix(&final_path);
        let candidates = [
            self.file_paths.get(file_id).cloned(),
            Some(part_path),
            Some(final_path),
        ];
        for path in candidates.into_iter().flatten() {
            if path.exists() {
                return Ok(std::fs::remove_file(&path)?);
            }
        }
        Ok(())
    }

    fn ensure_file_length(&self, file_id: usize, len: u64) -> anyhow::Result<()> {
        let f = &self.opened_files.get(file_id).context("no such file")?;
        #[cfg(windows)]
        f.try_mark_sparse()?;
        Ok(f.lock_read()?.set_len(len)?)
    }

    fn take(&self) -> anyhow::Result<Box<dyn TorrentStorage>> {
        Ok(Box::new(Self {
            opened_files: self
                .opened_files
                .iter()
                .map(|f| f.take_clone())
                .collect::<anyhow::Result<Vec<_>>>()?,
            output_folder: self.output_folder.clone(),
            file_paths: self.file_paths.clone(),
        }))
    }

    fn remove_directory_if_empty(&self, path: &Path) -> anyhow::Result<()> {
        let path = self.output_folder.join(path);
        if !path.is_dir() {
            anyhow::bail!("cannot remove dir: {path:?} is not a directory")
        }
        if std::fs::read_dir(&path)?.count() == 0 {
            std::fs::remove_dir(&path).with_context(|| format!("error removing {path:?}"))
        } else {
            warn!("did not remove {path:?} as it was not empty");
            Ok(())
        }
    }

    fn init(
        &mut self,
        shared: &ManagedTorrentShared,
        metadata: &TorrentMetadata,
    ) -> anyhow::Result<()> {
        let mut files = Vec::<OpenedFile>::new();
        let mut file_paths = Vec::with_capacity(metadata.file_infos.len());
        for file_details in metadata.file_infos.iter() {
            let mut final_path = self.output_folder.clone();
            let relative_path = &file_details.relative_filename;
            final_path.push(relative_path);

            if file_details.attrs.padding {
                files.push(OpenedFile::new_dummy());
                file_paths.push(final_path);
                continue;
            };

            let part_path = with_part_suffix(&final_path);
            // A completed file from an earlier run (or a pre-.part partial) is
            // opened in place; a new download always starts as <name>.part.
            // `prefer_part_files` (a fresh add) always parks the download in
            // the `.part` twin, so an existing final file survives until the
            // app renames the finished `.part` over it.
            let path = if shared.options.prefer_part_files
                || part_path.exists()
                || !final_path.exists()
            {
                part_path
            } else {
                final_path
            };
            std::fs::create_dir_all(path.parent().context("bug: no parent")?)?;
            let f = open_file(&path, shared.options.allow_overwrite)?;
            files.push(OpenedFile::new(path.clone(), f));
            file_paths.push(path);
        }

        self.opened_files = files;
        self.file_paths = file_paths;
        Ok(())
    }
}
