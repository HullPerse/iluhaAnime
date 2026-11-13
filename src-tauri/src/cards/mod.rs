pub mod ceilings;
pub mod collection;
pub mod collections;
pub mod config;
pub mod gallery;
pub mod grant;
pub mod metadata;
pub mod packs;
pub mod rarity;
pub mod rng;
pub mod sampling;
pub mod shop;
pub mod types;

use tauri::AppHandle;

use crate::anilist::auth::optional_token;
use crate::app_db::cards::{starter_grant, unopened_pack_count, wallet_balance, LOCAL_USER_ID};
use crate::app_db::db::open_database;
use types::CardsBootstrap;

/// Card ownership is a single local profile, so every path that can add cards
/// first has to prove that an AniList account is connected.
pub(crate) fn require_anilist_token(token: Option<&str>) -> Result<(), String> {
    if token.is_some_and(|value| !value.trim().is_empty()) {
        Ok(())
    } else {
        Err("AniList account required to receive cards".into())
    }
}

pub(crate) fn require_anilist_account(app: &AppHandle) -> Result<(), String> {
    let token = optional_token(app);
    require_anilist_token(token.as_deref())
}

/// Static card rules, wallet, starter status and the feature flags.
#[tauri::command]
pub fn cards_bootstrap(app: AppHandle) -> Result<CardsBootstrap, String> {
    let connection = open_database(&app)?;
    let starter = starter_grant(&connection, LOCAL_USER_ID)?;
    Ok(CardsBootstrap {
        config: config::cards_config(),
        grant_enabled: config::CARDS_GRANT_ENABLED,
        test_tools_enabled: config::CARDS_TEST_TOOLS_ENABLED,
        wallet: wallet_balance(&connection, LOCAL_USER_ID)?,
        unopened_packs: unopened_pack_count(&connection, LOCAL_USER_ID)?,
        starter_granted: starter.is_some(),
        starter_packs: starter.map_or(0, |row| row.packs),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_rarities_and_variants_serialize_as_lowercase() {
        assert_eq!(
            serde_json::to_value(types::CardKind::Anime).expect("kind"),
            serde_json::json!("anime")
        );
        assert_eq!(
            serde_json::to_value(types::CardRarity::Legendary).expect("rarity"),
            serde_json::json!("legendary")
        );
        assert_eq!(
            serde_json::to_value(types::CardVariant::Holo).expect("variant"),
            serde_json::json!("holo")
        );
    }

    #[test]
    fn card_grants_require_an_anilist_session() {
        assert!(require_anilist_token(None).is_err());
        assert!(require_anilist_token(Some("   ")).is_err());
        assert!(require_anilist_token(Some("token")).is_ok());
    }

    #[test]
    fn bootstrap_serializes_camel_case_and_keeps_grants_off() {
        let bootstrap = CardsBootstrap {
            config: config::cards_config(),
            grant_enabled: false,
            test_tools_enabled: true,
            wallet: 0,
            unopened_packs: 0,
            starter_granted: false,
            starter_packs: 0,
        };
        let value = serde_json::to_value(&bootstrap).expect("bootstrap");
        assert_eq!(value["grantEnabled"], false);
        assert_eq!(value["testToolsEnabled"], true);
        assert_eq!(value["unopenedPacks"], 0);
        assert_eq!(value["config"]["packSize"], 7);
    }
}
