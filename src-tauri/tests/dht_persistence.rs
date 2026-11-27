use librqbit::dht::DhtConfig;
use serde_json::{json, Value};

const HASH: &str = "0123456789abcdef0123456789abcdef01234567";

fn fixture(timestamp: &str) -> Value {
    json!({
        "self_id": HASH,
        "max_remembered_tokens": 1000,
        "max_remembered_peers": 1000,
        "max_distance": "00000fffffffffffffffffffffffffffffffffff",
        "tokens": [],
        "peers": { HASH: [{ "addr": "127.0.0.1:51413", "time": timestamp }] },
        "peers_len": 1
    })
}

#[test]
fn old_dht_snapshots_round_trip_without_losing_peers_or_timestamp_precision() {
    for (timestamp, canonical) in [
        ("1970-01-01T00:00:00Z", "1970-01-01T00:00:00Z"),
        ("2026-11-27T12:34:56Z", "2026-11-27T12:34:56Z"),
        ("2026-11-27T12:34:56.120Z", "2026-11-27T12:34:56.12Z"),
        ("2026-11-27T12:34:56.123456Z", "2026-11-27T12:34:56.123456Z"),
        (
            "2026-11-27T12:34:56.123456789Z",
            "2026-11-27T12:34:56.123456789Z",
        ),
        (
            "2026-11-27T15:34:56.123456789+03:00",
            "2026-11-27T12:34:56.123456789Z",
        ),
    ] {
        // Exercise the real serde type consumed by DHT startup, without a socket
        // or access to the user's persistence directory.
        let config = DhtConfig {
            peer_store: Some(serde_json::from_value(fixture(timestamp)).unwrap()),
            ..Default::default()
        };
        let encoded = serde_json::to_value(config.peer_store.as_ref().unwrap()).unwrap();
        assert_eq!(encoded["peers"][HASH][0]["addr"], "127.0.0.1:51413");
        assert_eq!(encoded["peers"][HASH].as_array().unwrap().len(), 1);
        assert_eq!(encoded["peers_len"], 1);
        let actual = encoded["peers"][HASH][0]["time"].as_str().unwrap();
        assert!(
            actual == timestamp || actual == canonical,
            "{timestamp}: {actual}"
        );
        let restored = DhtConfig {
            peer_store: Some(serde_json::from_value(encoded.clone()).unwrap()),
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(restored.peer_store.unwrap()).unwrap(),
            encoded
        );
    }
}

#[test]
fn malformed_dht_timestamps_are_rejected() {
    for timestamp in ["", "not a date", "2026-13-27T12:00:00Z", "2026-11-27"] {
        let result = serde_json::from_value(fixture(timestamp)).map(|peer_store| DhtConfig {
            peer_store: Some(peer_store),
            ..Default::default()
        });
        assert!(result.is_err(), "{timestamp}");
    }
}
