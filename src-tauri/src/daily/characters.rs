use super::character_pool::{pool, roster, Character};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_db::cards::{insert_pack, CardPackRow, LOCAL_USER_ID};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};
use crate::cards::{config::CARD_PACK_SIZE, types::CardPackContentsState};

#[derive(Clone, Deserialize, Serialize)]
pub struct SubmittedAnswers {
    pub character: String,
    pub anime: String,
}
#[derive(Clone, Deserialize, Serialize, Default)]
struct Progress {
    answers: Vec<SubmittedAnswers>,
    checked: bool,
    correct: Vec<[bool; 2]>,
}
impl Progress {
    fn correct(&self) -> usize {
        self.correct.iter().flatten().filter(|v| **v).count()
    }
    fn finished(&self) -> bool {
        self.checked
    }
}
#[derive(Serialize)]
pub struct FieldView {
    submitted: String,
    solved: bool,
    answer: Option<String>,
}
#[derive(Serialize)]
pub struct RoundView {
    tier: String,
    character: FieldView,
    anime: FieldView,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharactersView {
    day: String,
    rounds: Vec<RoundView>,
    correct: usize,
    finished: bool,
    reward_pack_id: Option<String>,
}

const PASS_SCORE: usize = 6;

#[derive(Clone, Deserialize, Serialize)]
pub struct AnimeAnswer {
    pub id: i64,
    pub name: String,
    pub aliases: Vec<String>,
}

#[derive(Serialize)]
pub struct IndexEntry {
    pub id: i64,
    pub name: String,
    pub aliases: Vec<String>,
}

#[derive(Serialize)]
pub struct CharactersSearchIndex {
    pub characters: Vec<IndexEntry>,
    pub anime: Vec<IndexEntry>,
}

/// Tier-free names and accepted anime titles for the typed guess fields. The
/// daily roster stays in the database, so this list cannot be narrowed by day.
pub fn search_index() -> Result<CharactersSearchIndex, String> {
    let pool = pool()?;
    let mut characters: Vec<IndexEntry> = pool
        .entries
        .iter()
        .map(|character| IndexEntry {
            id: character.id,
            name: character.name.clone(),
            aliases: character.aliases.clone(),
        })
        .collect();
    let mut anime = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for character in &pool.entries {
        let Some(answer) = character
            .anime_answers
            .iter()
            .find(|answer| answer.id == character.anime_id)
        else {
            continue;
        };
        if seen.insert(answer.id) {
            anime.push(IndexEntry {
                id: answer.id,
                name: answer.name.clone(),
                aliases: answer.aliases.clone(),
            });
        }
    }
    characters.sort_by_key(|entry| entry.name.to_lowercase());
    anime.sort_by_key(|entry| entry.name.to_lowercase());
    Ok(CharactersSearchIndex { characters, anime })
}

#[tauri::command]
pub fn daily_characters_search_index() -> Result<CharactersSearchIndex, String> {
    search_index()
}

pub fn ensure_table(db: &Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS daily_characters (day TEXT PRIMARY KEY, roster TEXT NOT NULL, progress TEXT NOT NULL, reward_pack_id TEXT, finished INTEGER NOT NULL DEFAULT 0)").map_err(|e| e.to_string())
}

/// Completed sheets for the shared daily journal, newest first.
pub(super) fn finished_scores(
    db: &Connection,
    limit: u32,
) -> Result<Vec<(String, usize, bool)>, String> {
    ensure_table(db)?;
    let mut statement = db
        .prepare(
            "SELECT day,progress FROM daily_characters WHERE finished=1 ORDER BY day DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([i64::from(limit)], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut scores = Vec::new();
    for row in rows {
        let (day, payload) = row.map_err(|e| e.to_string())?;
        let progress: Progress = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
        let correct = progress.correct();
        scores.push((day, correct, correct >= PASS_SCORE));
    }
    Ok(scores)
}

fn load(db: &Connection, day: &str) -> Result<(Vec<Character>, Progress, Option<String>), String> {
    ensure_table(db)?;
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM daily_characters WHERE day=?1)",
            [day],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        let roster = serde_json::to_string(&roster(day)?).map_err(|e| e.to_string())?;
        let progress = serde_json::to_string(&Progress {
            answers: vec![
                SubmittedAnswers {
                    character: String::new(),
                    anime: String::new()
                };
                5
            ],
            checked: false,
            correct: vec![[false; 2]; 5],
        })
        .map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR IGNORE INTO daily_characters(day,roster,progress) VALUES(?1,?2,?3)",
            params![day, roster, progress],
        )
        .map_err(|e| e.to_string())?;
    }
    let (roster, progress, reward): (String, String, Option<String>) = db
        .query_row(
            "SELECT roster,progress,reward_pack_id FROM daily_characters WHERE day=?1",
            [day],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok((
        serde_json::from_str(&roster).map_err(|e| e.to_string())?,
        serde_json::from_str(&progress).map_err(|e| e.to_string())?,
        reward,
    ))
}

fn view(
    day: &str,
    roster: &[Character],
    progress: &Progress,
    reward: Option<String>,
) -> CharactersView {
    let rounds = roster
        .iter()
        .enumerate()
        .map(|(i, c)| RoundView {
            tier: c.tier.clone(),
            character: FieldView {
                submitted: progress.answers[i].character.clone(),
                solved: progress.correct[i][0],
                answer: progress.checked.then(|| c.name.clone()),
            },
            anime: FieldView {
                submitted: progress.answers[i].anime.clone(),
                solved: progress.correct[i][1],
                answer: progress.checked.then(|| c.anime.clone()),
            },
        })
        .collect();
    CharactersView {
        day: day.into(),
        rounds,
        correct: progress.correct(),
        finished: progress.checked,
        reward_pack_id: reward,
    }
}

fn play(
    db: &Connection,
    day: &str,
    answers: Option<Vec<SubmittedAnswers>>,
    submit: bool,
) -> Result<CharactersView, String> {
    super::seed::validate_day(day)?;
    let (roster, mut progress, mut reward) = load(db, day)?;
    if let Some(answers) = answers.filter(|_| !progress.checked) {
        if answers.len() != 5
            || answers
                .iter()
                .any(|a| a.character.chars().count() > 160 || a.anime.chars().count() > 160)
        {
            return Err("invalid answer sheet".into());
        }
        progress.answers = answers;
        if submit {
            progress.checked = true;
            progress.correct = roster
                .iter()
                .zip(&progress.answers)
                .map(|(c, a)| {
                    [
                        super::character_answers::character_matches(c, &a.character),
                        c.anime_answers
                            .iter()
                            .any(|anime| super::character_answers::title_matches(anime, &a.anime)),
                    ]
                })
                .collect();
        }
        let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
        if reward.is_none() && progress.correct() >= PASS_SCORE {
            let id = format!("daily-{day}-characters");
            insert_pack(
                &tx,
                LOCAL_USER_ID,
                &CardPackRow {
                    id: id.clone(),
                    source: "daily".into(),
                    pack_kind: "default".into(),
                    media_id: None,
                    media_kind: None,
                    seed: super::seed::day_seed(day, super::types::DailyMode::Frames, 1001) as i64,
                    size: CARD_PACK_SIZE as i64,
                    created_at: now_seconds(),
                    opened_at: None,
                    contents_state: CardPackContentsState::Pending,
                    claimed_at: None,
                    chosen_slot: None,
                },
            )?;
            reward = Some(id);
        }
        let finished = progress.finished();
        tx.execute(
            "UPDATE daily_characters SET progress=?2,reward_pack_id=?3,finished=?4 WHERE day=?1",
            params![
                day,
                serde_json::to_string(&progress).map_err(|e| e.to_string())?,
                reward,
                finished
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(view(day, &roster, &progress, reward))
}

#[tauri::command]
pub async fn daily_characters_play(
    app: AppHandle,
    day: String,
    answers: Option<Vec<SubmittedAnswers>>,
    submit: bool,
) -> Result<CharactersView, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let db = open_database(&app)?;
        play(&db, &day, answers, submit)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn daily_characters_portrait(
    app: AppHandle,
    day: String,
    round: usize,
    proxy_url: Option<String>,
) -> Result<String, String> {
    use base64::Engine;
    super::seed::validate_day(&day)?;
    let url = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let db = open_database(&app)?;
        let (roster, _, _) = load(&db, &day)?;
        Ok(roster.get(round).ok_or("invalid round")?.image.clone())
    })
    .await
    .map_err(|e| e.to_string())??;
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("s4.anilist.co") {
        return Err("invalid portrait host".into());
    }
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20));
    if let Some(proxy) = proxy_url.filter(|s| !s.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|e| e.to_string())?);
    }
    let mut response = builder
        .build()
        .map_err(|e| e.to_string())?
        .get(parsed)
        .send()
        .await
        .map_err(|_| "portrait request failed")?
        .error_for_status()
        .map_err(|_| "portrait unavailable")?;
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_owned();
    if !["image/jpeg", "image/png", "image/webp"].contains(&mime.as_str()) {
        return Err("invalid portrait type".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "portrait download failed")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("portrait is too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
#[path = "characters_tests.rs"]
mod tests;
