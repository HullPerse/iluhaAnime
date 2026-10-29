use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use url::Url;

pub const MAX_TEXT_CHARS: usize = 128;
pub const MAX_BUTTON_LABEL_CHARS: usize = 32;
pub const MAX_URL_CHARS: usize = 512;
const MAX_BUTTONS: usize = 2;
const ALLOWED_TYPES: [u8; 4] = [0, 2, 3, 5];

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscordActivity {
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    /// Unix time in milliseconds.
    #[serde(default)]
    pub start_timestamp: Option<i64>,
    /// Unix time in milliseconds.
    #[serde(default)]
    pub end_timestamp: Option<i64>,
    #[serde(default)]
    pub activity_type: Option<u8>,
    #[serde(default)]
    pub buttons: Vec<DiscordButton>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscordButton {
    pub label: String,
    pub url: String,
}

impl DiscordActivity {
    /// Drops fields Discord would reject and trims the rest to the documented
    /// limits. A bad optional field is omitted instead of failing the card.
    pub fn sanitize(mut self) -> Self {
        self.details = clean_text(self.details);
        self.state = clean_text(self.state);
        self.activity_type = self
            .activity_type
            .filter(|kind| ALLOWED_TYPES.contains(kind));
        self.start_timestamp = self.start_timestamp.filter(|value| *value > 0);
        self.end_timestamp = self.end_timestamp.filter(|value| *value > 0);
        if let (Some(start), Some(end)) = (self.start_timestamp, self.end_timestamp) {
            if end <= start {
                self.end_timestamp = None;
            }
        }
        self.buttons = self
            .buttons
            .into_iter()
            .filter_map(DiscordButton::sanitize)
            .take(MAX_BUTTONS)
            .collect();
        self
    }

    pub fn is_empty(&self) -> bool {
        self.details.is_none()
            && self.state.is_none()
            && self.start_timestamp.is_none()
            && self.end_timestamp.is_none()
            && self.buttons.is_empty()
    }

    pub fn to_json(&self) -> Value {
        let mut object = Map::new();
        if let Some(details) = &self.details {
            object.insert("details".to_string(), json!(details));
        }
        if let Some(state) = &self.state {
            object.insert("state".to_string(), json!(state));
        }
        if self.start_timestamp.is_some() || self.end_timestamp.is_some() {
            let mut timestamps = Map::new();
            if let Some(start) = self.start_timestamp {
                timestamps.insert("start".to_string(), json!(start));
            }
            if let Some(end) = self.end_timestamp {
                timestamps.insert("end".to_string(), json!(end));
            }
            object.insert("timestamps".to_string(), Value::Object(timestamps));
        }
        if let Some(kind) = self.activity_type {
            object.insert("type".to_string(), json!(kind));
        }
        if !self.buttons.is_empty() {
            let buttons = self
                .buttons
                .iter()
                .map(|button| json!({"label": button.label, "url": button.url}))
                .collect();
            object.insert("buttons".to_string(), Value::Array(buttons));
        }
        Value::Object(object)
    }
}

impl DiscordButton {
    fn sanitize(self) -> Option<Self> {
        let label = clean_text(Some(self.label))?;
        let label = truncate_chars(&label, MAX_BUTTON_LABEL_CHARS);
        let raw = self.url.trim();
        if raw.is_empty() || raw.chars().count() > MAX_URL_CHARS {
            return None;
        }
        let parsed = Url::parse(raw).ok()?;
        if parsed.scheme() != "https"
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return None;
        }
        Some(Self {
            label,
            url: raw.to_string(),
        })
    }
}

fn clean_text(value: Option<String>) -> Option<String> {
    let text = value?;
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }
    Some(truncate_chars(&collapsed, MAX_TEXT_CHARS))
}

fn truncate_chars(value: &str, limit: usize) -> String {
    let count = value.chars().count();
    if count <= limit {
        return value.to_string();
    }
    if limit <= 3 {
        return value.chars().take(limit).collect();
    }
    let mut truncated = value.chars().take(limit - 3).collect::<String>();
    truncated.push_str("...");
    truncated
}

#[cfg(test)]
mod tests {
    use super::*;

    fn activity() -> DiscordActivity {
        DiscordActivity::default()
    }

    #[test]
    fn trims_and_caps_text() {
        let clean = DiscordActivity {
            details: Some("  Made in   Abyss  ".to_string()),
            state: Some("x".repeat(200)),
            ..activity()
        }
        .sanitize();

        assert_eq!(clean.details.as_deref(), Some("Made in Abyss"));
        assert_eq!(
            clean.state.as_deref().map(|value| value.chars().count()),
            Some(MAX_TEXT_CHARS)
        );
    }

    #[test]
    fn drops_unsafe_or_long_buttons() {
        let clean = DiscordActivity {
            buttons: vec![
                DiscordButton {
                    label: "plain".to_string(),
                    url: "http://anilist.co".to_string(),
                },
                DiscordButton {
                    label: "credentials".to_string(),
                    url: "https://user:secret@anilist.co".to_string(),
                },
                DiscordButton {
                    label: "ok".to_string(),
                    url: "https://anilist.co/anime/1".to_string(),
                },
                DiscordButton {
                    label: "second".to_string(),
                    url: "https://anilist.co/anime/2".to_string(),
                },
                DiscordButton {
                    label: "third".to_string(),
                    url: "https://anilist.co/anime/3".to_string(),
                },
            ],
            ..activity()
        }
        .sanitize();

        assert_eq!(clean.buttons.len(), MAX_BUTTONS);
        assert_eq!(clean.buttons[0].label, "ok");
        assert_eq!(clean.buttons[1].label, "second");
    }

    #[test]
    fn drops_invalid_timestamps_and_types() {
        let clean = DiscordActivity {
            start_timestamp: Some(1_000),
            end_timestamp: Some(500),
            activity_type: Some(9),
            ..activity()
        }
        .sanitize();

        assert_eq!(clean.start_timestamp, Some(1_000));
        assert_eq!(clean.end_timestamp, None);
        assert_eq!(clean.activity_type, None);
    }

    #[test]
    fn builds_the_discord_shape() {
        let clean = DiscordActivity {
            details: Some("Frieren".to_string()),
            state: Some("Episode 12".to_string()),
            start_timestamp: Some(1_000),
            end_timestamp: Some(2_000),
            activity_type: Some(3),
            buttons: vec![DiscordButton {
                label: "AniList".to_string(),
                url: "https://anilist.co/anime/1".to_string(),
            }],
        }
        .sanitize();
        let value = clean.to_json();

        assert_eq!(value["details"], "Frieren");
        assert_eq!(value["state"], "Episode 12");
        assert_eq!(value["timestamps"]["start"], 1_000);
        assert_eq!(value["timestamps"]["end"], 2_000);
        assert_eq!(value["type"], 3);
        assert_eq!(value["buttons"][0]["label"], "AniList");
    }

    #[test]
    fn empty_activity_has_no_payload() {
        assert!(activity().sanitize().is_empty());
        assert!(
            DiscordActivity {
                activity_type: Some(3),
                ..activity()
            }
            .sanitize()
            .is_empty()
        );
    }
}
