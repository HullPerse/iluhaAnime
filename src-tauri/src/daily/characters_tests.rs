use super::*;
use crate::app_db::schema::initialize_schema;
use crate::daily::character_pool::pool;

const DAY: &str = "2026-11-28";
fn db() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    initialize_schema(&db).unwrap();
    db
}
fn answers(db: &Connection) -> Vec<SubmittedAnswers> {
    load(db, DAY)
        .unwrap()
        .0
        .iter()
        .map(|c| SubmittedAnswers {
            character: c.name.clone(),
            anime: c.anime.clone(),
        })
        .collect()
}

#[test]
fn search_index_covers_every_character_and_distinct_anime_without_tiers() {
    let index = search_index().unwrap();
    let pool = pool().unwrap();
    assert_eq!(index.characters.len(), pool.entries.len());
    let character_ids: std::collections::HashSet<_> =
        index.characters.iter().map(|entry| entry.id).collect();
    assert_eq!(character_ids.len(), index.characters.len());
    let expected_anime: std::collections::HashSet<_> = pool
        .entries
        .iter()
        .map(|character| character.anime_id)
        .collect();
    let anime_ids: std::collections::HashSet<_> =
        index.anime.iter().map(|entry| entry.id).collect();
    assert_eq!(anime_ids, expected_anime);
}

#[test]
fn anime_only_pool_is_unique_complete_and_has_expected_tiers() {
    let pool = pool().unwrap();
    assert!(pool.entries.len() >= 500);
    let ids: std::collections::HashSet<_> = pool.entries.iter().map(|c| c.id).collect();
    assert_eq!(ids.len(), pool.entries.len());
    for c in &pool.entries {
        assert_eq!(c.anime_type, "ANIME");
        assert!(c.anime_answers.iter().any(|a| a.id == c.anime_id));
        assert!(c.image.starts_with("https://s4.anilist.co/"));
    }
    assert_eq!(
        pool.entries.iter().filter(|c| c.tier == "easy").count(),
        120
    );
    assert_eq!(
        pool.entries.iter().filter(|c| c.tier == "medium").count(),
        280
    );
}

#[test]
fn rosters_are_shared_balanced_and_do_not_repeat_within_fourteen_days() {
    let mut recent: std::collections::VecDeque<Vec<i64>> = std::collections::VecDeque::new();
    let mut day = "2026-12-31".to_string();
    for _ in 0..366 {
        let rows = roster(&day).unwrap();
        assert_eq!(
            rows.iter().map(|c| c.id).collect::<Vec<_>>(),
            roster(&day)
                .unwrap()
                .iter()
                .map(|c| c.id)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            rows.iter().map(|c| c.tier.as_str()).collect::<Vec<_>>(),
            vec!["easy", "easy", "medium", "medium", "hard"]
        );
        assert_eq!(
            rows.iter()
                .map(|c| c.anime_id)
                .collect::<std::collections::HashSet<_>>()
                .len(),
            5
        );
        let ids: Vec<_> = rows.iter().map(|c| c.id).collect();
        assert!(
            !recent.iter().flatten().any(|id| ids.contains(id)),
            "repeat on {day}"
        );
        recent.push_back(ids);
        if recent.len() > 14 {
            recent.pop_front();
        }
        day = crate::daily::seed::previous_day(&day).unwrap();
    }
}

#[test]
fn drafts_reveal_nothing_and_do_not_grant_a_pack() {
    let db = db();
    let sheet = answers(&db);
    let state = play(&db, DAY, Some(sheet), false).unwrap();
    assert_eq!(state.correct, 0);
    assert!(!state.finished);
    assert!(state
        .rounds
        .iter()
        .all(|r| r.character.answer.is_none() && r.anime.answer.is_none()));
    let reopened = play(&db, DAY, None, false).unwrap();
    assert_eq!(
        reopened.rounds[0].character.submitted,
        state.rounds[0].character.submitted
    );
    assert!(reopened.reward_pack_id.is_none());
    assert_eq!(crate::daily::store::streak(&db, DAY), 0);
}

#[test]
fn five_answers_lose_six_win_and_a_repeat_cannot_change_the_result() {
    for count in [5, 6, 10] {
        let db = db();
        let mut sheet = answers(&db);
        for (i, a) in sheet.iter_mut().enumerate() {
            if i * 2 >= count {
                a.character = String::new();
            }
            if i * 2 + 1 >= count {
                a.anime = String::new();
            }
        }
        let state = play(&db, DAY, Some(sheet), true).unwrap();
        assert_eq!(state.correct, count);
        assert!(state.finished);
        assert_eq!(state.reward_pack_id.is_some(), count >= 6);
        let repeat = play(&db, DAY, Some(answers(&db)), true).unwrap();
        assert_eq!(repeat.correct, count);
        assert_eq!(repeat.reward_pack_id, state.reward_pack_id);
        let packs: i64 = db
            .query_row("SELECT COUNT(*) FROM card_packs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(packs, if count >= 6 { 1 } else { 0 });
        assert_eq!(crate::daily::store::streak(&db, DAY), 1);
    }
}

#[test]
fn each_field_is_scored_independently_and_all_answers_are_revealed_together() {
    let db = db();
    let mut sheet = answers(&db);
    sheet[0].character = "wrong".into();
    sheet[1].anime = "wrong".into();
    let state = play(&db, DAY, Some(sheet), true).unwrap();
    assert_eq!(state.correct, 8);
    assert!(!state.rounds[0].character.solved);
    assert!(state.rounds[0].anime.solved);
    assert!(state.rounds[1].character.solved);
    assert!(!state.rounds[1].anime.solved);
    assert!(state
        .rounds
        .iter()
        .all(|r| r.character.answer.is_some() && r.anime.answer.is_some()));
}

#[test]
fn aliases_case_punctuation_transliteration_and_short_character_names_are_accepted() {
    use crate::daily::character_answers::{character_matches, title_matches};
    let naruto = pool()
        .unwrap()
        .entries
        .iter()
        .find(|c| c.name == "Naruto Uzumaki")
        .unwrap();
    assert!(character_matches(naruto, "  Наруто! "));
    assert!(character_matches(naruto, "UZUMAKI NARUTO"));
    assert!(!character_matches(naruto, "Na"));
    assert!(!character_matches(naruto, ""));
    assert!(title_matches(
        &naruto.anime_answers[0],
        &naruto.anime_answers[0].name.to_uppercase()
    ));
    let alternate = AnimeAnswer {
        id: 1,
        name: "Example".into(),
        aliases: vec!["Русское название".into()],
    };
    assert!(title_matches(&alternate, "Русское название"));
}

#[test]
fn malformed_or_oversized_sheets_are_rejected_before_writing() {
    let db = db();
    assert!(play(&db, "2026-02-30", None, false).is_err());
    assert!(play(&db, DAY, Some(vec![]), true).is_err());
    let mut sheet = answers(&db);
    sheet[0].character = "x".repeat(161);
    assert!(play(&db, DAY, Some(sheet), true).is_err());
    assert!(!play(&db, DAY, None, false).unwrap().finished);
}

#[test]
fn finished_sheets_are_shared_with_the_history_and_reset_clears_drafts() {
    let db = db();
    play(&db, DAY, Some(answers(&db)), true).unwrap();
    assert_eq!(
        finished_scores(&db, 20).unwrap(),
        vec![(DAY.to_string(), 10, true)]
    );
    assert!(!play(&db, "2026-11-29", None, false).unwrap().finished);
    crate::daily::store::reset(&db).unwrap();
    assert!(finished_scores(&db, 20).unwrap().is_empty());
    assert!(!play(&db, DAY, None, false).unwrap().finished);
}

#[test]
fn pack_insert_failure_rolls_back_the_entire_submission() {
    let db = db();
    let sheet = answers(&db);
    db.execute_batch("CREATE TRIGGER fail_pack BEFORE INSERT ON card_packs BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    assert!(play(&db, DAY, Some(sheet), true).is_err());
    let state = play(&db, DAY, None, false).unwrap();
    assert!(!state.finished);
    assert_eq!(state.correct, 0);
    assert!(state.reward_pack_id.is_none());
}
