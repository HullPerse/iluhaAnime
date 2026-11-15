use std::collections::HashSet;

#[test]
fn every_daily_pool_entry_has_a_checked_mode() {
    let pool: serde_json::Value =
        serde_json::from_str(include_str!("../data/daily-pool-v1.json")).expect("pool JSON");
    assert_eq!(pool["version"], 5);
    let entries = pool["entries"].as_array().expect("entries");
    assert_eq!(entries.len(), 1024);

    let mut ids = HashSet::new();
    for entry in entries {
        let id = entry["mediaId"].as_i64().expect("mediaId");
        assert!(ids.insert(id), "duplicate media id {id}");
        let modes = entry["modes"].as_array().expect("modes");
        assert!(!modes.is_empty(), "entry {id} has no modes");
        assert!(
            modes
                .iter()
                .all(|mode| matches!(mode.as_str(), Some("frames" | "op" | "audio"))),
            "entry {id} has an unknown mode"
        );
    }
}
