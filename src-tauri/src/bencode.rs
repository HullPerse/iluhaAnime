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

pub fn extract_info_hash(torrent_bytes: &[u8]) -> Result<String, String> {
    let info_bytes = find_info_value_bytes(torrent_bytes)?;
    let mut hasher = sha1::Sha1::new();
    hasher.update(info_bytes);
    let hash = hasher.finalize();
    Ok(hex::encode(hash))
}

pub fn extract_torrent_name(torrent_bytes: &[u8]) -> Result<String, String> {
    let info_bytes = find_info_value_bytes(torrent_bytes)?;
    let info: InfoDict = serde_bencode::from_bytes(info_bytes)
        .map_err(|e| format!("Failed to parse info dict: {e}"))?;
    info.name_utf8
        .or(info.name)
        .ok_or_else(|| "No name found".to_string())
}

pub fn extract_announce_url(torrent_bytes: &[u8]) -> Result<String, String> {
    let file: TorrentFile = serde_bencode::from_bytes(torrent_bytes)
        .map_err(|e| format!("Failed to parse torrent file: {e}"))?;
    file.announce.ok_or_else(|| "No announce found".to_string())
}

fn find_info_value_bytes(bytes: &[u8]) -> Result<&[u8], String> {
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
                .ok_or_else(|| "Unterminated integer".to_string())?;
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
        _ => Err(format!("Unknown bencode type at pos {pos}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_bencode_value_skips_integer() {
        assert_eq!(skip_bencode_value(b"i42e", 0).unwrap(), 4);
        assert_eq!(skip_bencode_value(b"i0e", 0).unwrap(), 3);
        assert_eq!(skip_bencode_value(b"i-1e", 0).unwrap(), 4);
    }

    #[test]
    fn skip_bencode_value_skips_string() {
        let result = skip_bencode_value(b"4:spam", 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 6);
    }

    #[test]
    fn skip_bencode_value_skips_list() {
        let result = skip_bencode_value(b"l4:spami42ee", 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 12);
    }

    #[test]
    fn skip_bencode_value_skips_dict() {
        let result = skip_bencode_value(b"d4:spami42ee", 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 12);
    }

    #[test]
    fn skip_bencode_value_errors_on_unterminated() {
        assert!(skip_bencode_value(b"li42e", 0).is_err());
        assert!(skip_bencode_value(b"d4:spam", 0).is_err());
    }

    #[test]
    fn find_info_value_bytes_finds_info() {
        let bytes = b"d4:infod4:name5:helloee";
        let result = find_info_value_bytes(bytes);
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info, b"d4:name5:helloe");
    }

    #[test]
    fn find_info_value_bytes_errors_without_info() {
        let bytes = b"d4:namel5:helloee";
        assert!(find_info_value_bytes(bytes).is_err());
    }

    #[test]
    fn extract_info_hash_returns_40_char_hex() {
        let torrent = b"d4:infod4:name5:helloee";
        let hash = extract_info_hash(torrent);
        assert!(hash.is_ok());
        let hash = hash.unwrap();
        assert_eq!(hash.len(), 40);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn extract_torrent_name_returns_name() {
        let torrent = b"d4:infod4:name5:helloee";
        let name = extract_torrent_name(torrent);
        assert_eq!(name.unwrap(), "hello");
    }

    #[test]
    fn extract_announce_url_returns_announce() {
        let torrent = b"d8:announce15:http://track.eee";
        let url = extract_announce_url(torrent);
        assert_eq!(url.unwrap(), "http://track.ee");
    }

    #[test]
    fn extract_announce_url_errors_without_announce() {
        let torrent = b"d4:infod4:name5:helloee";
        assert!(extract_announce_url(torrent).is_err());
    }
}
