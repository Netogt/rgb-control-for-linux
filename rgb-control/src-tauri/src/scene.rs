//! Configuração persistente do app e "cena inicial": o estado que é
//! reaplicado quando a sessão começa (`rgb-control --apply-saved`).

use crate::openrgb::{Client, Color, Device, Mode};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{Duration, Instant};

pub const APP_ID: &str = "dev.luizneto.rgbcontrol";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub openrgb_path: String,
    pub auto_connect: bool,
    pub live_preview: bool,
    pub favorites: Vec<String>,
    pub recent: Vec<String>,
    pub boot_scene: Vec<SceneDevice>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            host: "127.0.0.1".into(),
            port: 6742,
            openrgb_path: String::new(),
            auto_connect: true,
            live_preview: true,
            favorites: vec![
                "#ff0000".into(),
                "#ff6a00".into(),
                "#ffd400".into(),
                "#00ff6a".into(),
                "#00c8ff".into(),
                "#2a4bff".into(),
                "#9d00ff".into(),
                "#ffffff".into(),
            ],
            recent: Vec::new(),
            boot_scene: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneDevice {
    pub name: String,
    pub location: String,
    pub mode_name: String,
    pub mode: Mode,
    pub colors: Vec<Color>,
}

pub fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_ID)
        .join("config.json")
}

pub fn load_config() -> Config {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_config(config: &Config) -> std::io::Result<()> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string_pretty(config).map_err(std::io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(tmp, path)
}

pub fn capture(devices: &[Device]) -> Vec<SceneDevice> {
    devices
        .iter()
        .filter_map(|d| {
            let mode = d.modes.get(d.active_mode as usize)?.clone();
            Some(SceneDevice {
                name: d.name.clone(),
                location: d.location.clone(),
                mode_name: mode.name.clone(),
                mode,
                colors: d.colors.clone(),
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneReport {
    pub applied: Vec<String>,
    pub missing: Vec<String>,
}

/// Dispositivos são casados por nome + local, porque o índice pode mudar
/// entre detecções.
pub fn apply(client: &mut Client, scene: &[SceneDevice]) -> crate::openrgb::Result<SceneReport> {
    let devices = client.devices()?;
    let mut report = SceneReport {
        applied: Vec::new(),
        missing: Vec::new(),
    };

    for saved in scene {
        let found = devices
            .iter()
            .find(|d| d.name == saved.name && d.location == saved.location)
            .or_else(|| devices.iter().find(|d| d.name == saved.name));

        let Some(device) = found else {
            report.missing.push(saved.name.clone());
            continue;
        };

        let Some(mode_idx) = device.modes.iter().position(|m| m.name == saved.mode_name) else {
            report.missing.push(saved.name.clone());
            continue;
        };

        client.update_mode(device.index, mode_idx as i32, &saved.mode, false)?;
        if saved.mode.color_mode == crate::COLOR_MODE_PER_LED && saved.colors.len() == device.colors.len() {
            client.update_leds(device.index, &saved.colors)?;
        }
        report.applied.push(saved.name.clone());
    }

    Ok(report)
}

/// Executado pelo autostart da sessão: sobe o serviço se ele estiver
/// parado, espera o servidor (a detecção de dispositivos leva alguns
/// segundos), aplica a cena salva e para o serviço se foi ele que subiu.
pub fn run_headless_apply() -> i32 {
    let config = load_config();
    if config.boot_scene.is_empty() {
        eprintln!("rgb-control: nenhuma cena inicial salva");
        return 0;
    }

    let started = match crate::system::start_service() {
        Ok(started) => started,
        Err(e) => {
            // Sem serviço instalado, ainda pode haver um servidor iniciado
            // de outro jeito; segue tentando conectar.
            eprintln!("rgb-control: {e}");
            false
        }
    };
    let code = apply_when_ready(&config);
    if started {
        // Dá tempo para os últimos comandos chegarem aos dispositivos.
        std::thread::sleep(Duration::from_secs(1));
        crate::system::stop_service();
    }
    code
}

fn apply_when_ready(config: &Config) -> i32 {
    let deadline = Instant::now() + Duration::from_secs(90);
    loop {
        match Client::connect(&config.host, config.port, "RGB Control (autostart)") {
            Ok(mut client) => {
                // Dá tempo para o servidor terminar a detecção.
                let mut last_count = 0;
                for _ in 0..10 {
                    let count = client.controller_count().unwrap_or(0);
                    if count > 0 && count == last_count {
                        break;
                    }
                    last_count = count;
                    std::thread::sleep(Duration::from_secs(2));
                }
                return match apply(&mut client, &config.boot_scene) {
                    Ok(report) => {
                        println!("rgb-control: aplicado em {:?}", report.applied);
                        if !report.missing.is_empty() {
                            eprintln!("rgb-control: não encontrados: {:?}", report.missing);
                        }
                        0
                    }
                    Err(e) => {
                        eprintln!("rgb-control: {e}");
                        1
                    }
                };
            }
            Err(e) if Instant::now() > deadline => {
                eprintln!("rgb-control: {e}");
                return 1;
            }
            Err(_) => std::thread::sleep(Duration::from_secs(3)),
        }
    }
}
