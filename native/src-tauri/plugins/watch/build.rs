const COMMANDS: &[&str] = &["start", "stop", "foreground"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
