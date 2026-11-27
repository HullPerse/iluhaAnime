use base64::{engine::general_purpose::STANDARD, Engine as _};

#[test]
fn persisted_base64_vectors_and_invalid_inputs() {
    for (raw, encoded) in [
        ("", ""),
        ("f", "Zg=="),
        ("fo", "Zm8="),
        ("foo", "Zm9v"),
        ("foobar", "Zm9vYmFy"),
    ] {
        assert_eq!(STANDARD.encode(raw), encoded);
        assert_eq!(STANDARD.decode(encoded).unwrap(), raw.as_bytes());
    }
    for invalid in ["Zg", "Z===", "Zm9v!", "Zh=="] {
        assert!(STANDARD.decode(invalid).is_err(), "{invalid}");
    }
}

#[test]
fn database_transactions_commit_and_rollback_without_losing_existing_rows() {
    let mut db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE entries(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO entries VALUES(1, 'existing');").unwrap();
    {
        let transaction = db.transaction().unwrap();
        transaction
            .execute("INSERT INTO entries VALUES(2, 'rolled back')", [])
            .unwrap();
    }
    assert_eq!(
        db.query_row("SELECT count(*) FROM entries", [], |row| row
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    let transaction = db.transaction().unwrap();
    transaction
        .execute("INSERT INTO entries VALUES(2, 'committed')", [])
        .unwrap();
    transaction.commit().unwrap();
    let rows = db
        .prepare("SELECT value FROM entries ORDER BY id")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(rows, ["existing", "committed"]);
}

#[cfg(windows)]
#[test]
fn native_font_registry_enumeration_is_readable() {
    let root = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE);
    let fonts = root
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
        .unwrap();
    let values = fonts
        .enum_values()
        .collect::<std::io::Result<Vec<_>>>()
        .unwrap();
    assert!(values.iter().any(|(name, _)| !name.trim().is_empty()));
}

#[cfg(windows)]
#[test]
#[ignore = "shows one native notification; run explicitly for Windows acceptance"]
fn native_toast_submission_accepts_xml_characters() {
    use tauri_winrt_notification::{Duration, Toast};
    Toast::new(Toast::POWERSHELL_APP_ID)
        .title("iluhaAnime U4 verification")
        .text1("Compatibility check: <subtitle> & \"audio\"")
        .duration(Duration::Short)
        .show()
        .expect("Windows accepts toast submission");
}
