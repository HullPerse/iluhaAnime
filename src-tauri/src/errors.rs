use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize)]
pub enum AppErrorCode {
    #[serde(rename = "io_error")]
    Io,
    #[serde(rename = "json_error")]
    Json,
    #[serde(rename = "credential_store_error")]
    CredentialStore,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Credential store error: {0}")]
    Keyring(#[from] keyring::Error),
}

impl AppError {
    pub const fn code(&self) -> AppErrorCode {
        match self {
            Self::Io(_) => AppErrorCode::Io,
            Self::Json(_) => AppErrorCode::Json,
            Self::Keyring(_) => AppErrorCode::CredentialStore,
        }
    }

    pub fn message(&self) -> String {
        self.to_string()
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", &self.code())?;
        state.serialize_field("message", &self.message())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_stable_error_code_and_message() {
        let error = AppError::from(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "missing file",
        ));
        let value = serde_json::to_value(error).expect("error should serialize");
        assert_eq!(value["code"], "io_error");
        assert!(value["message"]
            .as_str()
            .unwrap_or_default()
            .contains("missing file"));
    }
}
