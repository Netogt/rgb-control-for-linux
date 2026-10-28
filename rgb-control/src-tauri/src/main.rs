// Evita abrir um console extra no Windows em builds de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Modo sem janela usado pelo autostart da sessão.
    if std::env::args().any(|a| a == "--apply-saved") {
        std::process::exit(rgb_control_lib::run_headless_apply());
    }
    rgb_control_lib::run()
}
