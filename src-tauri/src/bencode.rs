use serde::Deserialize;
use sha1::Digest;

#[derive(Deserialize)]
struct InfoDict {
    name: Option<String>,
    #[serde(alias = "name.utf-8")]
    name_utf8: Option<String>,
}

#[derive(Deserialize)]
struct TorrentFile {
    announce: Option<String>,
}

pub(crate) fn extract_info_hash(torrent_bytes: &[u8]) -> Result<String, String> {
    let info_bytes = find_info_value_bytes(torrent_bytes)?;
    let mut hasher = sha1::Sha1::new();
    hasher.update(info_bytes);
    let hash = hasher.finalize();
    Ok(hex::encode(hash))
}

pub(crate) fn extract_torrent_name(torrent_bytes: &[u8]) -> Result<String, String> {
    let info_bytes = find_info_value_bytes(torrent_bytes)?;
    let info: InfoDict = serde_bencode::from_bytes(info_bytes)
        .map_err(|e| format!("Failed to parse info dict: {e}"))?;
    info.name_utf8
        .or(info.name)
        .ok_or_else(|| "No name found".to_string())
}

pub(crate) fn extract_announce_url(torrent_bytes: &[u8]) -> Result<String, String> {
    let file: TorrentFile = serde_bencode::from_bytes(torrent_bytes)
        .map_err(|e| format!("Failed to parse torrent file: {e}"))?;
    file.announce.ok_or_else(|| "No announce found".to_string())
}

fn find_info_value_bytes<'a>(bytes: &'a [u8]) -> Result<&'a [u8], String> {
    let marker = b"4:info";
    let start = bytes
        .windows(marker.len())
        .position(|w| w == marker)
        .ok_or_else(|| "Info key not found in torrent".to_string())?
        + marker.len();

    let end = skip_bencode_value(bytes, start)?;
    Ok(&bytes[start..end])
}

fn skip_bencode_value(bytes: &[u8], pos: usize) -> Result<usize, String> {
    if pos >= bytes.len() {
        return Err("Unexpected end".to_string());
    }
    match bytes[pos] {
        b'i' => {
            let end = bytes[pos..]
                .iter()
                .position(|&b| b == b'e')
                .ok_or("Unterminated integer".to_string())?;
            Ok(pos + end + 1)
        }
        b'l' | b'd' => {
            let mut p = pos + 1;
            while p < bytes.len() && bytes[p] != b'e' {
                p = skip_bencode_value(bytes, p)?;
            }
            if p >= bytes.len() {
                return Err("Unterminated list/dict".to_string());
            }
            Ok(p + 1)
        }
        c if c.is_ascii_digit() => {
            let remaining = &bytes[pos..];
            let colon_pos = remaining
                .iter()
                .position(|&b| b == b':')
                .ok_or("No colon in bencode string")?;
            let len_str = std::str::from_utf8(&remaining[..colon_pos])
                .map_err(|_| "Invalid length".to_string())?;
            let len: usize = len_str
                .parse()
                .map_err(|_| "Invalid length number".to_string())?;
            Ok(pos + colon_pos + 1 + len)
        }
        _ => Err(format!("Unknown bencode type at pos {}", pos)),
    }
}
