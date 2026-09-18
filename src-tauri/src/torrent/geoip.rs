//! Country lookup for peer addresses, backed by a compact range table.
//!
//! The data is the DB-IP Lite country database (CC-BY-4.0, <https://db-ip.com>), packed
//! by `scripts/build-geoip.ts` and embedded in the binary. Lookups stay local on purpose:
//! asking a third-party API about a peer's address would leak the swarm, and the app has
//! to keep working offline.
//!
//! Format (see the generator for the writer side): a 15 byte header, the country table,
//! then range starts as varint deltas with a parallel country index per range. Ranges are
//! contiguous by construction, so a lookup is "the last range that starts at or before
//! the address" - no end bound is stored.
//!
//! The table is decoded on first use (a few milliseconds, a few megabytes) and then kept
//! for the process lifetime. Regenerating it is `bun scripts/build-geoip.ts`.
use std::io::Read;
use std::net::{IpAddr, SocketAddr};
use std::sync::OnceLock;

const MAGIC: &[u8; 4] = b"ILG1";
const VERSION: u8 = 1;
const HEADER_LEN: usize = 15;
/// Country the generator writes for addresses outside every known range.
const UNKNOWN: &str = "XX";

const PACKED: &[u8] = include_bytes!("../../data/geoip-v1.bin.gz");

struct Table {
    countries: Vec<String>,
    v4_starts: Vec<u32>,
    v4_countries: Vec<u8>,
    v6_starts: Vec<u128>,
    v6_countries: Vec<u8>,
}

fn read_varint(bytes: &[u8], cursor: &mut usize) -> Result<u128, String> {
    let mut value: u128 = 0;
    let mut shift = 0u32;
    loop {
        let byte = *bytes
            .get(*cursor)
            .ok_or_else(|| "country table ended inside a varint".to_string())?;
        *cursor += 1;
        if shift > 126 {
            return Err("country table contains an oversized varint".to_string());
        }
        value |= u128::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
        shift += 7;
    }
}

fn take<'a>(bytes: &'a [u8], cursor: &mut usize, count: usize) -> Result<&'a [u8], String> {
    let end = cursor
        .checked_add(count)
        .ok_or_else(|| "country table length overflowed".to_string())?;
    let slice = bytes
        .get(*cursor..end)
        .ok_or_else(|| "country table is truncated".to_string())?;
    *cursor = end;
    Ok(slice)
}

/// Range starts are stored as deltas from the previous start, the first from zero. A zero
/// delta past the first entry would mean two ranges at the same address.
fn decode_starts(bytes: &[u8], cursor: &mut usize, count: usize) -> Result<Vec<u128>, String> {
    let mut starts = Vec::with_capacity(count);
    let mut previous: u128 = 0;
    for index in 0..count {
        let delta = read_varint(bytes, cursor)?;
        if delta == 0 && index > 0 {
            return Err("country table ranges are not distinct".to_string());
        }
        previous = previous
            .checked_add(delta)
            .ok_or_else(|| "country table range overflowed".to_string())?;
        starts.push(previous);
    }
    Ok(starts)
}

impl Table {
    fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.get(..4) != Some(MAGIC.as_slice()) {
            return Err("country table has a foreign magic number".to_string());
        }
        if bytes.get(4) != Some(&VERSION) {
            return Err("country table has an unsupported version".to_string());
        }
        if bytes.len() < HEADER_LEN {
            return Err("country table header is truncated".to_string());
        }
        let country_count = usize::from(u16::from_le_bytes([bytes[5], bytes[6]]));
        let v4_count = u32::from_le_bytes([bytes[7], bytes[8], bytes[9], bytes[10]]) as usize;
        let v6_count = u32::from_le_bytes([bytes[11], bytes[12], bytes[13], bytes[14]]) as usize;
        // Every range costs at least one varint byte and one country byte, so a count
        // larger than the payload can only be a corrupt file - and must not be allocated.
        if v4_count.saturating_mul(2) > bytes.len() || v6_count.saturating_mul(2) > bytes.len() {
            return Err("country table counts exceed the payload".to_string());
        }

        let mut cursor = HEADER_LEN;
        let country_bytes = take(bytes, &mut cursor, country_count * 2)?;
        let countries = country_bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| String::from_utf8_lossy(pair).to_uppercase())
            .collect::<Vec<_>>();

        let v4_starts = decode_starts(bytes, &mut cursor, v4_count)?
            .into_iter()
            .map(|start| u32::try_from(start).map_err(|_| "v4 range is out of range".to_string()))
            .collect::<Result<Vec<u32>, String>>()?;
        let v4_countries = take(bytes, &mut cursor, v4_count)?.to_vec();

        let v6_starts = decode_starts(bytes, &mut cursor, v6_count)?;
        let v6_countries = take(bytes, &mut cursor, v6_count)?.to_vec();

        if cursor != bytes.len() {
            return Err("country table has trailing bytes".to_string());
        }
        if v4_starts.first() != Some(&0) || v6_starts.first() != Some(&0) {
            return Err("country table does not start at address zero".to_string());
        }
        Ok(Self {
            countries,
            v4_starts,
            v4_countries,
            v6_starts,
            v6_countries,
        })
    }

    fn name(&self, index: u8) -> Option<&str> {
        let code = self.countries.get(usize::from(index))?;
        // The unknown bucket is not a country and must not be rendered as one.
        if code == UNKNOWN || code.is_empty() {
            return None;
        }
        Some(code.as_str())
    }

    fn lookup4(&self, ip: u32) -> Option<&str> {
        let index = self
            .v4_starts
            .partition_point(|start| *start <= ip)
            .checked_sub(1)?;
        self.name(*self.v4_countries.get(index)?)
    }

    fn lookup6(&self, ip: u128) -> Option<&str> {
        let index = self
            .v6_starts
            .partition_point(|start| *start <= ip)
            .checked_sub(1)?;
        self.name(*self.v6_countries.get(index)?)
    }
}

fn table() -> Option<&'static Table> {
    static TABLE: OnceLock<Option<Table>> = OnceLock::new();
    TABLE
        .get_or_init(|| {
            let mut decoder = flate2::read::GzDecoder::new(PACKED);
            let mut raw = Vec::new();
            if let Err(error) = decoder.read_to_end(&mut raw) {
                tracing::warn!("country table could not be decompressed: {error}");
                return None;
            }
            match Table::parse(&raw) {
                Ok(table) => Some(table),
                Err(error) => {
                    tracing::warn!("country table could not be parsed: {error}");
                    None
                }
            }
        })
        .as_ref()
}

/// ISO 3166-1 alpha-2 code for the address, or `None` when the address has no country
/// (private, reserved, or simply absent from the database).
pub fn country_code(ip: IpAddr) -> Option<&'static str> {
    // The table outlives the process, so the reborrow below is already `'static`.
    let table = table()?;
    match ip {
        IpAddr::V4(v4) => table.lookup4(u32::from(v4)),
        IpAddr::V6(v6) => table.lookup6(u128::from(v6)),
    }
}

/// Country for the address strings the session reports, such as `1.2.3.4:6881` or
/// `[2001:db8::1]:6881`.
pub fn country_code_for_addr(addr: &str) -> Option<&'static str> {
    let ip = addr.parse::<SocketAddr>().ok()?.ip();
    country_code(ip)
}

#[cfg(test)]
mod tests {
    use super::{country_code, country_code_for_addr, Table, MAGIC, VERSION};

    fn varint(mut value: u128, out: &mut Vec<u8>) {
        while value >= 0x80 {
            out.push(((value & 0x7f) as u8) | 0x80);
            value >>= 7;
        }
        out.push(value as u8);
    }

    /// Mirrors the generator so the reader is checked against the documented layout.
    fn build(countries: &[&str], v4: &[(u128, u8)], v6: &[(u128, u8)]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(MAGIC);
        out.push(VERSION);
        out.extend_from_slice(&(countries.len() as u16).to_le_bytes());
        out.extend_from_slice(&(v4.len() as u32).to_le_bytes());
        out.extend_from_slice(&(v6.len() as u32).to_le_bytes());
        for country in countries {
            out.extend_from_slice(country.as_bytes());
        }
        for ranges in [v4, v6] {
            let mut previous = 0u128;
            for (start, _) in ranges {
                varint(*start - previous, &mut out);
                previous = *start;
            }
            for (_, index) in ranges {
                out.push(*index);
            }
        }
        out
    }

    #[test]
    fn looks_up_the_range_that_starts_last() {
        let bytes = build(
            &["XX", "DE", "US"],
            &[(0, 0), (100, 1), (200, 2)],
            &[(0, 0)],
        );
        let table = Table::parse(&bytes).expect("table");
        assert_eq!(
            table.lookup4(0),
            None,
            "the unknown bucket is not a country"
        );
        assert_eq!(table.lookup4(99), None);
        assert_eq!(table.lookup4(100), Some("DE"));
        assert_eq!(table.lookup4(199), Some("DE"));
        assert_eq!(table.lookup4(200), Some("US"));
        assert_eq!(table.lookup4(u32::MAX), Some("US"));
        assert_eq!(table.lookup6(0), None);
    }

    #[test]
    fn rejects_malformed_tables() {
        assert!(Table::parse(b"").is_err());
        assert!(Table::parse(b"NOPE\x01").is_err());
        let bytes = build(&["XX", "DE"], &[(0, 0), (100, 1)], &[(0, 0)]);
        assert!(
            Table::parse(&bytes[..bytes.len() - 1]).is_err(),
            "truncated payload"
        );
        assert!(
            Table::parse(&[bytes.as_slice(), &[0]].concat()).is_err(),
            "trailing bytes"
        );
        let duplicated = build(&["XX", "DE"], &[(0, 0), (0, 1)], &[(0, 0)]);
        assert!(Table::parse(&duplicated).is_err(), "duplicate range start");
    }

    #[test]
    fn resolves_the_embedded_database() {
        // IPv4 answers are stable; IPv6 in this dataset is registration based and coarser,
        // so it is only checked for "resolves at all".
        assert_eq!(country_code("8.8.8.8".parse().unwrap()), Some("US"));
        assert_eq!(country_code("77.88.55.88".parse().unwrap()), Some("RU"));
        assert_eq!(
            country_code_for_addr("8.8.8.8:6881"),
            Some("US"),
            "socket addresses are accepted as the session reports them"
        );
        assert!(country_code("2001:4860:4860::8888".parse().unwrap()).is_some());
        assert_eq!(country_code("192.168.1.1".parse().unwrap()), None);
        assert_eq!(country_code("10.0.0.5".parse().unwrap()), None);
        assert_eq!(country_code("127.0.0.1".parse().unwrap()), None);
        assert_eq!(country_code("fe80::1".parse().unwrap()), None);
        assert_eq!(country_code_for_addr("not-an-address"), None);
    }
}
