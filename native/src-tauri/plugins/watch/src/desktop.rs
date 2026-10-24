use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(app: &AppHandle<R>, _api: PluginApi<R, C>) -> crate::Result<ChatsWatch<R>> {
  Ok(ChatsWatch(app.clone()))
}

/// Desktop builds keep the whole app running in the tray, so there is nothing to watch from outside it.
pub struct ChatsWatch<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> ChatsWatch<R> {
  pub fn start(&self, _payload: StartRequest) -> crate::Result<()> { Ok(()) }
  pub fn stop(&self) -> crate::Result<()> { Ok(()) }
  pub fn foreground(&self, _payload: ForegroundRequest) -> crate::Result<()> { Ok(()) }
}
