use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DailyMode {
    Frames,
    Op,
    Audio,
}

impl DailyMode {
    pub const ALL: [Self; 3] = [Self::Frames, Self::Op, Self::Audio];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Frames => "frames",
            Self::Op => "op",
            Self::Audio => "audio",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "frames" => Ok(Self::Frames),
            "op" => Ok(Self::Op),
            "audio" => Ok(Self::Audio),
            other => Err(format!("unknown daily mode: {other}")),
        }
    }

    pub const fn max_attempts(self) -> u32 {
        match self {
            Self::Frames => 6,
            Self::Op => 5,
            Self::Audio => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DailyTier {
    Easy,
    Medium,
    Hard,
}

impl DailyTier {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Easy => "easy",
            Self::Medium => "medium",
            Self::Hard => "hard",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DailyGameState {
    Pending,
    Ready,
    Failed,
}

impl DailyGameState {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "pending" => Ok(Self::Pending),
            "ready" => Ok(Self::Ready),
            "failed" => Ok(Self::Failed),
            other => Err(format!("unknown daily game state: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAnswer {
    pub media_id: i64,
    pub title: String,
    pub year: Option<i32>,
    pub format: Option<String>,
    pub episodes: Option<i32>,
    pub genres: Vec<String>,
    pub studio: Option<String>,
    pub score: Option<i32>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyResultView {
    pub won: bool,
    pub attempts: u32,
    pub answer: DailyAnswer,
    pub reward_pack_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyModeView {
    pub mode: DailyMode,
    pub state: DailyGameState,
    pub attempts: u32,
    pub max_attempts: u32,
    pub error: Option<String>,
    pub result: Option<DailyResultView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyBootstrap {
    pub day: String,
    pub modes: Vec<DailyModeView>,
    pub streak: i64,
}

/// One finished day, for the result journal. Only played days appear here;
/// the answer title is frozen at the finish so the journal keeps it offline.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyHistoryItem {
    pub day: String,
    pub mode: DailyMode,
    pub won: bool,
    pub attempts: u32,
    pub max_attempts: u32,
    pub media_id: Option<i64>,
    pub title: String,
    pub played_at: i64,
}

/// One decoded crop. `data_url` is a base64 JPEG; the full screenshot never
/// reaches the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyFrameView {
    pub slot: u32,
    pub data_url: String,
    pub hint_kind: String,
    pub hint_value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyFramesView {
    pub day: String,
    pub mode: DailyMode,
    pub attempts: u32,
    pub max_attempts: u32,
    pub revealed: u32,
    pub frames: Vec<DailyFrameView>,
    pub result: Option<DailyResultView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyHintView {
    pub slot: u32,
    pub hint_kind: String,
    pub hint_value: String,
}

/// The OP/ED challenge. The clip stays a local opaque file: the source URL
/// carries the anime title and never reaches the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyOpView {
    pub day: String,
    pub mode: DailyMode,
    pub attempts: u32,
    pub max_attempts: u32,
    pub revealed: u32,
    pub clip_path: String,
    pub full_path: String,
    pub start_fraction: f64,
    pub theme_type: String,
    pub hints: Vec<DailyHintView>,
    pub result: Option<DailyResultView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyOpGuessView {
    pub correct: bool,
    pub same_franchise: bool,
    pub finished: bool,
    pub state: DailyOpView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyGuessView {
    pub correct: bool,
    pub same_franchise: bool,
    pub attempts: u32,
    pub max_attempts: u32,
    pub revealed: u32,
    pub finished: bool,
    pub frame: Option<DailyFrameView>,
    pub result: Option<DailyResultView>,
}
