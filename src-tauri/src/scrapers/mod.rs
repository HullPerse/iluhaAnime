pub mod clients;
pub mod details;
pub mod search;

pub use clients::{
    build_client, build_nekobt_client, build_no_redirect_client, build_rutracker_client,
    build_rutracker_client_with_ua, cookies_to_header, decode_windows_1251,
    extract_cookies_from_headers, resolve_proxy, url_encode, RUTRACKER_DEFAULT_UA,
};
pub use details::*;
pub use search::*;
