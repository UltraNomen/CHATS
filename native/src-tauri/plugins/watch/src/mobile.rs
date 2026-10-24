use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(_app: &AppHandle<R>, api: PluginApi<R, C>) -> crate::Result<ChatsWatch<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("io.github.ultranomen.chats.watch", "WatchPlugin")?;
  #[cfg(target_os = "ios")]
  let handle: PluginHandle<R> = { let _ = api; unimplemented!("CHATS has no iOS build") };
  Ok(ChatsWatch(handle))
}

pub struct ChatsWatch<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ChatsWatch<R> {
  pub fn start(&self, payload: StartRequest) -> crate::Result<()> {
    self.0.run_mobile_plugin::<()>("start", payload).map_err(Into::into)
  }
  pub fn stop(&self) -> crate::Result<()> {
    self.0.run_mobile_plugin::<()>("stop", ()).map_err(Into::into)
  }
  pub fn foreground(&self, payload: ForegroundRequest) -> crate::Result<()> {
    self.0.run_mobile_plugin::<()>("foreground", payload).map_err(Into::into)
  }
}
