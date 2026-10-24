use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::ChatsWatchExt;
use crate::Result;

#[command]
pub(crate) async fn start<R: Runtime>(app: AppHandle<R>, payload: StartRequest) -> Result<()> {
  app.chats_watch().start(payload)
}

#[command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.chats_watch().stop()
}

#[command]
pub(crate) async fn foreground<R: Runtime>(app: AppHandle<R>, payload: ForegroundRequest) -> Result<()> {
  app.chats_watch().foreground(payload)
}
