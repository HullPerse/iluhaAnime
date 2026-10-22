#[cfg(windows)]
pub fn mark_file_sparse(f: &std::fs::File) -> bool {
    use std::os::windows::io::AsRawHandle;
    use windows::{
        Win32::Foundation::HANDLE, Win32::System::IO::DeviceIoControl,
        Win32::System::Ioctl::FSCTL_SET_SPARSE,
    };

    let handle = HANDLE(f.as_raw_handle());

    // lpBytesReturned must be non-NULL for a synchronous call: the upstream
    // version passes NULL and FSCTL_SET_SPARSE is rejected with
    // ERROR_INVALID_PARAMETER, so every file silently stays fully allocated.
    let mut returned = 0u32;
    unsafe {
        DeviceIoControl(
            handle,
            FSCTL_SET_SPARSE,
            None,
            0,
            None,
            0,
            Some(&mut returned),
            None,
        )
        .is_ok()
    }
}
