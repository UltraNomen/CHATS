use serde::{Deserialize, Serialize};

/// What the Android service needs to check the user's server, and the (translated) notification text.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
  /// API base, e.g. "https://chat.example.org/api/"
  pub base: String,
  /// The app session's bearer token
  pub token: String,
  pub title: String,
  /// "1 new message"
  pub one: String,
  /// "{n} new messages"
  pub many: String,
  /// Text of the persistent "checking for new messages" notification
  #[serde(default)]
  pub status: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundRequest {
  pub on: bool,
}
