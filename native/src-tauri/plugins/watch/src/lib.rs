//! On Android, a foreground service asks the user's own CHATS server how many new messages arrived while the app is
//! in the background, so notifications work without Google's push service (for example on domestic-only internet).
//! On desktop the app keeps running in the tray instead, so these commands do nothing there.
use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::ChatsWatch;
#[cfg(mobile)]
use mobile::ChatsWatch;

pub trait ChatsWatchExt<R: Runtime> {
  fn chats_watch(&self) -> &ChatsWatch<R>;
}

impl<R: Runtime, T: Manager<R>> crate::ChatsWatchExt<R> for T {
  fn chats_watch(&self) -> &ChatsWatch<R> {
    self.state::<ChatsWatch<R>>().inner()
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("chats-watch")
    .invoke_handler(tauri::generate_handler![commands::start, commands::stop, commands::foreground])
    .setup(|app, api| {
      #[cfg(mobile)]
      let watch = mobile::init(app, api)?;
      #[cfg(desktop)]
      let watch = desktop::init(app, api)?;
      app.manage(watch);
      Ok(())
    })
    .build()
}
