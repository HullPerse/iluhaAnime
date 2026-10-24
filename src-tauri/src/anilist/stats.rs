use serde::Serialize;

use super::auth::load_token;
use super::client::graphql_request;
use crate::scrapers::clients::resolve_proxy;

const GENRE_LIMIT: u32 = 30;
const STUDIO_LIMIT: u32 = 20;

#[derive(Debug, Serialize)]
pub struct AniListStatusStatistic {
    pub status: String,
    pub count: i64,
    pub minutes_watched: i64,
}

#[derive(Debug, Serialize)]
pub struct AniListScoreStatistic {
    pub score: i64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct AniListFormatStatistic {
    pub format: String,
    pub count: i64,
    pub mean_score: f64,
    pub minutes_watched: i64,
    pub media_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct AniListYearStatistic {
    pub year: i64,
    pub count: i64,
    pub mean_score: f64,
    pub minutes_watched: i64,
    pub media_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct AniListGenreStatistic {
    pub genre: String,
    pub count: i64,
    pub mean_score: f64,
    pub minutes_watched: i64,
    pub media_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct AniListStudioStatistic {
    pub id: i64,
    pub name: String,
    pub count: i64,
    pub mean_score: f64,
    pub minutes_watched: i64,
    pub media_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct AniListStatistics {
    pub count: i64,
    pub mean_score: f64,
    pub standard_deviation: f64,
    pub minutes_watched: i64,
    pub episodes_watched: i64,
    pub statuses: Vec<AniListStatusStatistic>,
    pub scores: Vec<AniListScoreStatistic>,
    pub formats: Vec<AniListFormatStatistic>,
    pub release_years: Vec<AniListYearStatistic>,
    pub start_years: Vec<AniListYearStatistic>,
    pub genres: Vec<AniListGenreStatistic>,
    pub studios: Vec<AniListStudioStatistic>,
}

fn statistics_query() -> String {
    format!(
        r"
            query ($userId: Int) {{
                User(id: $userId) {{
                    statistics {{
                        anime {{
                            count
                            meanScore
                            standardDeviation
                            minutesWatched
                            episodesWatched
                            statuses {{ status count minutesWatched }}
                            scores {{ score count }}
                            formats {{ format count meanScore minutesWatched mediaIds }}
                            releaseYears {{ releaseYear count meanScore minutesWatched mediaIds }}
                            startYears {{ startYear count meanScore minutesWatched mediaIds }}
                            genres(limit: {GENRE_LIMIT}, sort: COUNT_DESC) {{
                                genre count meanScore minutesWatched mediaIds
                            }}
                            studios(limit: {STUDIO_LIMIT}, sort: COUNT_DESC) {{
                                studio {{ id name }}
                                count
                                meanScore
                                minutesWatched
                                mediaIds
                            }}
                        }}
                    }}
                }}
            }}
        "
    )
}

fn statistics_body(user_id: u64) -> serde_json::Value {
    serde_json::json!({
        "query": statistics_query(),
        "variables": { "userId": user_id }
    })
}

fn int(value: &serde_json::Value) -> i64 {
    value.as_i64().unwrap_or(0)
}

fn float(value: &serde_json::Value) -> f64 {
    value.as_f64().unwrap_or(0.0)
}

fn media_ids(value: &serde_json::Value) -> Vec<i64> {
    value
        .get("mediaIds")
        .and_then(serde_json::Value::as_array)
        .map(|ids| {
            ids.iter()
                .filter_map(serde_json::Value::as_i64)
                .collect::<Vec<i64>>()
        })
        .unwrap_or_default()
}

fn list<'a>(value: &'a serde_json::Value, key: &str) -> &'a [serde_json::Value] {
    match value.get(key).and_then(serde_json::Value::as_array) {
        Some(items) => items.as_slice(),
        None => &[],
    }
}

fn parse_status(entry: &serde_json::Value) -> Option<AniListStatusStatistic> {
    Some(AniListStatusStatistic {
        status: entry.get("status")?.as_str()?.to_string(),
        count: int(&entry["count"]),
        minutes_watched: int(&entry["minutesWatched"]),
    })
}

fn parse_score(entry: &serde_json::Value) -> Option<AniListScoreStatistic> {
    Some(AniListScoreStatistic {
        score: entry.get("score")?.as_i64()?,
        count: int(&entry["count"]),
    })
}

fn parse_format(entry: &serde_json::Value) -> Option<AniListFormatStatistic> {
    Some(AniListFormatStatistic {
        format: entry.get("format")?.as_str()?.to_string(),
        count: int(&entry["count"]),
        mean_score: float(&entry["meanScore"]),
        minutes_watched: int(&entry["minutesWatched"]),
        media_ids: media_ids(entry),
    })
}

fn parse_year(entry: &serde_json::Value, key: &str) -> Option<AniListYearStatistic> {
    Some(AniListYearStatistic {
        year: entry.get(key)?.as_i64()?,
        count: int(&entry["count"]),
        mean_score: float(&entry["meanScore"]),
        minutes_watched: int(&entry["minutesWatched"]),
        media_ids: media_ids(entry),
    })
}

fn parse_genre(entry: &serde_json::Value) -> Option<AniListGenreStatistic> {
    Some(AniListGenreStatistic {
        genre: entry.get("genre")?.as_str()?.to_string(),
        count: int(&entry["count"]),
        mean_score: float(&entry["meanScore"]),
        minutes_watched: int(&entry["minutesWatched"]),
        media_ids: media_ids(entry),
    })
}

fn parse_studio(entry: &serde_json::Value) -> Option<AniListStudioStatistic> {
    let studio = entry.get("studio")?;
    Some(AniListStudioStatistic {
        id: studio.get("id")?.as_i64()?,
        name: studio.get("name")?.as_str()?.to_string(),
        count: int(&entry["count"]),
        mean_score: float(&entry["meanScore"]),
        minutes_watched: int(&entry["minutesWatched"]),
        media_ids: media_ids(entry),
    })
}

pub fn parse_statistics(value: &serde_json::Value) -> Result<AniListStatistics, String> {
    let anime = value
        .get("data")
        .and_then(|data| data.get("User"))
        .and_then(|user| user.get("statistics"))
        .and_then(|statistics| statistics.get("anime"))
        .ok_or_else(|| "AniList statistics unavailable".to_string())?;

    Ok(AniListStatistics {
        count: int(&anime["count"]),
        mean_score: float(&anime["meanScore"]),
        standard_deviation: float(&anime["standardDeviation"]),
        minutes_watched: int(&anime["minutesWatched"]),
        episodes_watched: int(&anime["episodesWatched"]),
        statuses: list(anime, "statuses")
            .iter()
            .filter_map(parse_status)
            .collect(),
        scores: list(anime, "scores").iter().filter_map(parse_score).collect(),
        formats: list(anime, "formats")
            .iter()
            .filter_map(parse_format)
            .collect(),
        release_years: list(anime, "releaseYears")
            .iter()
            .filter_map(|entry| parse_year(entry, "releaseYear"))
            .collect(),
        start_years: list(anime, "startYears")
            .iter()
            .filter_map(|entry| parse_year(entry, "startYear"))
            .collect(),
        genres: list(anime, "genres").iter().filter_map(parse_genre).collect(),
        studios: list(anime, "studios")
            .iter()
            .filter_map(parse_studio)
            .collect(),
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_statistics(
    app_handle: tauri::AppHandle,
    user_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AniListStatistics, String> {
    let token = load_token(&app_handle)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(statistics_body(user_id), Some(&token), proxy.as_deref()).await?;
    parse_statistics(&json)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn statistics_fixture() -> serde_json::Value {
        serde_json::json!({
            "data": {
                "User": {
                    "statistics": {
                        "anime": {
                            "count": 286,
                            "meanScore": 74.4,
                            "standardDeviation": 12.75,
                            "minutesWatched": 152_640,
                            "episodesWatched": 6_360,
                            "statuses": [
                                { "status": "COMPLETED", "count": 210, "minutesWatched": 120_000 },
                                { "status": "CURRENT", "count": 12, "minutesWatched": 1_440 }
                            ],
                            "scores": [
                                { "score": 70, "count": 40 },
                                { "score": 80, "count": 91 }
                            ],
                            "formats": [
                                {
                                    "format": "TV",
                                    "count": 180,
                                    "meanScore": 75.1,
                                    "minutesWatched": 110_000,
                                    "mediaIds": [21, 22, 23]
                                }
                            ],
                            "releaseYears": [
                                {
                                    "releaseYear": 2023,
                                    "count": 24,
                                    "meanScore": 78.0,
                                    "minutesWatched": 12_000,
                                    "mediaIds": [101, 102]
                                }
                            ],
                            "startYears": [
                                {
                                    "startYear": 2019,
                                    "count": 31,
                                    "meanScore": 71.5,
                                    "minutesWatched": 9_600,
                                    "mediaIds": [7, 8, 9]
                                }
                            ],
                            "genres": [
                                {
                                    "genre": "Drama",
                                    "count": 90,
                                    "meanScore": 79.2,
                                    "minutesWatched": 58_000,
                                    "mediaIds": [11, 12]
                                }
                            ],
                            "studios": [
                                {
                                    "studio": { "id": 43, "name": "ufotable" },
                                    "count": 14,
                                    "meanScore": 84.0,
                                    "minutesWatched": 5_800,
                                    "mediaIds": [19]
                                },
                                {
                                    "studio": null,
                                    "count": 2,
                                    "meanScore": 60.0,
                                    "minutesWatched": 120,
                                    "mediaIds": [20]
                                }
                            ]
                        }
                    }
                }
            }
        })
    }

    #[test]
    fn parses_scalars_and_every_group() {
        let parsed = parse_statistics(&statistics_fixture()).expect("parsed statistics");
        assert_eq!(parsed.count, 286);
        assert_eq!(parsed.mean_score, 74.4);
        assert_eq!(parsed.standard_deviation, 12.75);
        assert_eq!(parsed.minutes_watched, 152_640);
        assert_eq!(parsed.episodes_watched, 6_360);
        assert_eq!(parsed.statuses.len(), 2);
        assert_eq!(parsed.statuses[0].status, "COMPLETED");
        assert_eq!(parsed.statuses[0].minutes_watched, 120_000);
        assert_eq!(parsed.scores[1].score, 80);
        assert_eq!(parsed.scores[1].count, 91);
        assert_eq!(parsed.formats[0].format, "TV");
        assert_eq!(parsed.formats[0].media_ids, vec![21, 22, 23]);
        assert_eq!(parsed.release_years[0].year, 2023);
        assert_eq!(parsed.start_years[0].year, 2019);
        assert_eq!(parsed.start_years[0].media_ids, vec![7, 8, 9]);
        assert_eq!(parsed.genres[0].genre, "Drama");
        assert_eq!(parsed.genres[0].mean_score, 79.2);
        assert_eq!(parsed.studios.len(), 1);
        assert_eq!(parsed.studios[0].id, 43);
        assert_eq!(parsed.studios[0].name, "ufotable");
        assert_eq!(parsed.studios[0].media_ids, vec![19]);
    }

    #[test]
    fn empty_groups_parse_to_empty_vectors() {
        let value = serde_json::json!({
            "data": { "User": { "statistics": { "anime": {
                "count": 0,
                "meanScore": 0,
                "standardDeviation": 0,
                "minutesWatched": 0,
                "episodesWatched": 0,
                "statuses": [],
                "scores": [],
                "formats": [],
                "releaseYears": [],
                "startYears": [],
                "genres": [],
                "studios": []
            } } } }
        });
        let parsed = parse_statistics(&value).expect("parsed empty statistics");
        assert_eq!(parsed.count, 0);
        assert_eq!(parsed.mean_score, 0.0);
        assert!(parsed.statuses.is_empty());
        assert!(parsed.scores.is_empty());
        assert!(parsed.formats.is_empty());
        assert!(parsed.release_years.is_empty());
        assert!(parsed.start_years.is_empty());
        assert!(parsed.genres.is_empty());
        assert!(parsed.studios.is_empty());
    }

    #[test]
    fn missing_groups_do_not_fail_a_valid_profile() {
        let value = serde_json::json!({
            "data": { "User": { "statistics": { "anime": { "count": 5 } } } }
        });
        let parsed = parse_statistics(&value).expect("parsed statistics");
        assert_eq!(parsed.count, 5);
        assert!(parsed.genres.is_empty());
        assert_eq!(parsed.minutes_watched, 0);
    }

    #[test]
    fn missing_statistics_is_an_error() {
        let null_user = serde_json::json!({ "data": { "User": null } });
        assert!(parse_statistics(&null_user).is_err());
        let no_data = serde_json::json!({ "errors": [{ "message": "not found" }] });
        assert!(parse_statistics(&no_data).is_err());
        let no_anime = serde_json::json!({ "data": { "User": { "statistics": null } } });
        assert!(parse_statistics(&no_anime).is_err());
    }

    #[test]
    fn drops_entries_without_their_key_field() {
        let value = serde_json::json!({
            "data": { "User": { "statistics": { "anime": {
                "count": 1,
                "releaseYears": [{ "count": 1 }, { "releaseYear": 2020, "count": 2 }],
                "startYears": [{ "startYear": null, "count": 1 }],
                "genres": [{ "count": 3 }, { "genre": "Comedy", "count": 1 }],
                "studios": [{ "studio": { "name": "No id" }, "count": 1 }]
            } } } }
        });
        let parsed = parse_statistics(&value).expect("parsed statistics");
        assert_eq!(parsed.release_years.len(), 1);
        assert_eq!(parsed.release_years[0].year, 2020);
        assert!(parsed.start_years.is_empty());
        assert_eq!(parsed.genres.len(), 1);
        assert_eq!(parsed.genres[0].genre, "Comedy");
        assert!(parsed.studios.is_empty());
    }

    #[test]
    fn query_limits_genres_and_studios_and_sorts_by_count() {
        let query = statistics_query();
        assert!(query.contains("genres(limit: 30, sort: COUNT_DESC)"));
        assert!(query.contains("studios(limit: 20, sort: COUNT_DESC)"));
        assert!(query.contains("releaseYears { releaseYear"));
        assert!(query.contains("startYears { startYear"));
        assert!(!query.contains("releaseYears("));
        assert!(!query.contains("startYears("));
    }

    #[test]
    fn body_carries_the_user_id() {
        let body = statistics_body(7);
        assert_eq!(body["variables"]["userId"], 7);
    }
}
