use serde::Serialize;

use super::auth::optional_token;
use super::client::graphql_request;
use super::media::{MEDIA_CORE_SELECTION, parse_animedia, AniMedia};
use crate::scrapers::clients::resolve_proxy;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaStatistics {
    count: u64,
    chapters: u64,
    volumes: u64,
    mean_score: f64,
    genres: Vec<MangaStatisticGroup>,
    formats: Vec<MangaStatisticGroup>,
    statuses: Vec<MangaStatisticGroup>,
    years: Vec<MangaStatisticGroup>,
}

#[derive(Serialize)]
pub struct MangaStatisticGroup {
    label: String,
    count: u64,
}

#[derive(Serialize)]
pub struct MangaOverview {
    statistics: MangaStatistics,
    favourites: Vec<AniMedia>,
}

fn groups(stats: &serde_json::Value, collection: &str, field: &str) -> Vec<MangaStatisticGroup> {
    stats[collection]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| {
            let label = row[field]
                .as_str()
                .map(str::to_owned)
                .or_else(|| row[field].as_i64().map(|year| year.to_string()))?;
            Some(MangaStatisticGroup {
                label,
                count: row["count"].as_u64()?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn get_anilist_manga_overview(
    app_handle: tauri::AppHandle,
    user_id: u64,
    proxy_url: Option<String>,
) -> Result<MangaOverview, String> {
    let query = format!(
        "query ($userId: Int) {{
             User(id: $userId) {{
                 statistics {{ manga {{
                     count chaptersRead volumesRead meanScore
                     genres(limit: 30) {{ genre count }}
                     formats {{ format count }}
                     statuses {{ status count }}
                     releaseYears {{ releaseYear count }}
                 }} }}
                 favourites {{ manga(perPage: 50) {{ nodes {{ {} }} }} }}
             }}
         }}",
        MEDIA_CORE_SELECTION
    );
    let body = serde_json::json!({ "query": query, "variables": { "userId": user_id } });
    let proxy = resolve_proxy(proxy_url, None);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    let user = &json["data"]["User"];
    let stats = &user["statistics"]["manga"];
    if !stats.is_object() {
        return Err("Missing AniList manga statistics".to_owned());
    }
    Ok(MangaOverview {
        statistics: MangaStatistics {
            count: stats["count"].as_u64().unwrap_or(0),
            chapters: stats["chaptersRead"].as_u64().unwrap_or(0),
            volumes: stats["volumesRead"].as_u64().unwrap_or(0),
            mean_score: stats["meanScore"].as_f64().unwrap_or(0.0),
            genres: groups(stats, "genres", "genre"),
            formats: groups(stats, "formats", "format"),
            statuses: groups(stats, "statuses", "status"),
            years: groups(stats, "releaseYears", "releaseYear"),
        },
        favourites: user["favourites"]["manga"]["nodes"]
            .as_array()
            .into_iter()
            .flatten()
            .map(parse_animedia)
            .collect(),
    })
}

#[tauri::command]
pub async fn toggle_anilist_manga_favourite(
    app_handle: tauri::AppHandle,
    manga_id: u64,
    proxy_url: Option<String>,
) -> Result<(), String> {
    let token = super::auth::load_token(&app_handle)?;
    let proxy = resolve_proxy(proxy_url, None);
    graphql_request(
        serde_json::json!({
            "query": "mutation ($mangaId: Int) { ToggleFavourite(mangaId: $mangaId) { manga { pageInfo { total } } } }",
            "variables": { "mangaId": manga_id }
        }),
        Some(&token),
        proxy.as_deref(),
    ).await?;
    Ok(())
}
