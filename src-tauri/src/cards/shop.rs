use serde::Serialize;
use tauri::AppHandle;

use super::config::{shop_pack, CARD_PACK_SIZE};
use super::packs::spawn_prepare_packs;
use super::rng::seed_now;
use crate::app_db::cards::{
    insert_ledger, insert_pack, spend_wallet, trim_ledger, wallet_balance, CardPackRow,
    ChubrikLedgerRow, LEDGER_RETENTION, LOCAL_USER_ID,
};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseResult {
    pub pack: CardPackRow,
    pub price: i64,
    pub wallet: i64,
}

/// Buys one themed pack. The wallet and the ledger move in the same
/// transaction as the pack insert.
#[tauri::command]
pub fn cards_buy_pack(app: AppHandle, pack_kind: String) -> Result<PurchaseResult, String> {
    let entry = shop_pack(pack_kind.trim()).ok_or("unknown shop pack")?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("buy card pack transaction: {error}"))?;
    if !spend_wallet(&transaction, LOCAL_USER_ID, entry.price)? {
        return Err("not enough chubriks".into());
    }
    let seed = seed_now();
    let now = now_seconds();
    insert_ledger(
        &transaction,
        LOCAL_USER_ID,
        &ChubrikLedgerRow {
            id: format!("buy-{seed}"),
            amount: -entry.price,
            reason: format!("shop:{}", entry.pack_kind),
            at: now,
        },
    )?;
    trim_ledger(&transaction, LOCAL_USER_ID, LEDGER_RETENTION)?;
    let pack = CardPackRow {
        id: format!("buy-{seed}"),
        source: "purchase".into(),
        pack_kind: entry.pack_kind.into(),
        media_id: None,
        seed: seed as i64,
        size: CARD_PACK_SIZE as i64,
        created_at: now,
        opened_at: None,
        contents_state: super::types::CardPackContentsState::Pending,
    };
    insert_pack(&transaction, LOCAL_USER_ID, &pack)?;
    transaction
        .commit()
        .map_err(|error| format!("commit card pack purchase: {error}"))?;
    let wallet = wallet_balance(&connection, LOCAL_USER_ID)?;
    drop(connection);
    spawn_prepare_packs(app);
    Ok(PurchaseResult {
        pack,
        price: entry.price,
        wallet,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prices_are_pinned_in_the_shared_config() {
        assert_eq!(shop_pack("default").unwrap().price, 100);
        assert_eq!(shop_pack("character").unwrap().price, 100);
        assert_eq!(shop_pack("anime").unwrap().price, 100);
        assert_eq!(shop_pack("staff").unwrap().price, 100);
        assert_eq!(shop_pack("studio").unwrap().price, 100);
    }
}
