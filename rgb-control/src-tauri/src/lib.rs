mod openrgb;
mod scene;
mod system;

use openrgb::{Client, Color, Device, Mode};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

pub use scene::run_headless_apply;

const FLAG_HAS_PER_LED_COLOR: u32 = 1 << 5;
const FLAG_HAS_MODE_SPECIFIC_COLOR: u32 = 1 << 6;
pub(crate) const COLOR_MODE_PER_LED: u32 = 1;
const COLOR_MODE_MODE_SPECIFIC: u32 = 2;

const EVENT_CONNECTION: &str = "rgb://connection";
const EVENT_DEVICES_CHANGED: &str = "rgb://devices-changed";

#[derive(Default)]
struct AppState {
    client: Arc<Mutex<Option<Client>>>,
    /// O servidor foi iniciado por este app e deve parar quando ele fechar.
    started_server: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionEvent {
    connected: bool,
    reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectInfo {
    protocol: u32,
    server_protocol: u32,
    devices: Vec<Device>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyOutcome {
    device: Device,
    /// Nome do modo para o qual o dispositivo foi trocado, se precisou.
    switched_to: Option<String>,
}

type CmdResult<T> = Result<T, String>;

/// Executa `f` com o cliente conectado numa thread de bloqueio. Se a
/// conexão cair no meio, descarta o cliente e avisa a interface.
async fn with_client<T, F>(app: &AppHandle, state: &State<'_, AppState>, f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce(&mut Client) -> openrgb::Result<T> + Send + 'static,
{
    let shared = state.client.clone();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = shared.lock().unwrap();
        let client = guard
            .as_mut()
            .ok_or_else(|| "não conectado ao servidor OpenRGB".to_string())?;
        match f(client) {
            Ok(value) => Ok(value),
            Err(openrgb::Error::Io(e)) => {
                *guard = None;
                let reason = format!("conexão perdida: {e}");
                let _ = app.emit(
                    EVENT_CONNECTION,
                    ConnectionEvent {
                        connected: false,
                        reason: Some(reason.clone()),
                    },
                );
                Err(reason)
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Verifica a conexão periodicamente para detectar queda do servidor e
/// mudanças na lista de dispositivos.
fn spawn_watcher(app: AppHandle, shared: Arc<Mutex<Option<Client>>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1500));
        let mut guard = shared.lock().unwrap();
        let Some(client) = guard.as_mut() else { continue };
        match client.poll() {
            Ok(()) => {
                if client.devices_changed {
                    client.devices_changed = false;
                    let _ = app.emit(EVENT_DEVICES_CHANGED, ());
                }
            }
            Err(e) => {
                *guard = None;
                let _ = app.emit(
                    EVENT_CONNECTION,
                    ConnectionEvent {
                        connected: false,
                        reason: Some(e.to_string()),
                    },
                );
            }
        }
    });
}

#[tauri::command]
async fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    host: String,
    port: u16,
) -> CmdResult<ConnectInfo> {
    let shared = state.client.clone();
    let info = tauri::async_runtime::spawn_blocking(move || -> CmdResult<ConnectInfo> {
        let mut client = Client::connect(&host, port, "RGB Control").map_err(|e| e.to_string())?;
        let devices = client.devices().map_err(|e| e.to_string())?;
        let info = ConnectInfo {
            protocol: client.protocol,
            server_protocol: client.server_protocol,
            devices,
        };
        *shared.lock().unwrap() = Some(client);
        Ok(info)
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = app.emit(
        EVENT_CONNECTION,
        ConnectionEvent {
            connected: true,
            reason: None,
        },
    );
    Ok(info)
}

#[tauri::command]
fn disconnect(app: AppHandle, state: State<'_, AppState>) {
    *state.client.lock().unwrap() = None;
    let _ = app.emit(
        EVENT_CONNECTION,
        ConnectionEvent {
            connected: false,
            reason: None,
        },
    );
}

#[tauri::command]
async fn list_devices(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Vec<Device>> {
    with_client(&app, &state, |c| c.devices()).await
}

#[tauri::command]
async fn rescan(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    with_client(&app, &state, |c| c.rescan()).await
}

/// Escolhe o modo usado para pintar com uma cor fixa quando o modo atual
/// não aceita cores por LED: "Static" primeiro, depois "Direct", depois o
/// primeiro modo com cores por LED.
fn pick_paint_mode(device: &Device) -> Option<usize> {
    let per_led = |m: &Mode| m.flags & FLAG_HAS_PER_LED_COLOR != 0;
    let by_name = |name: &str| {
        device
            .modes
            .iter()
            .position(|m| per_led(m) && m.name.eq_ignore_ascii_case(name))
    };
    by_name("Static")
        .or_else(|| by_name("Direct"))
        .or_else(|| device.modes.iter().position(per_led))
}

fn paint(
    client: &mut Client,
    index: u32,
    color: Color,
    zone: Option<u32>,
    leds: Option<Vec<u32>>,
) -> openrgb::Result<ApplyOutcome> {
    let mut device = client.controller_data(index)?;
    let whole_device = zone.is_none() && leds.is_none();
    let mut switched_to = None;

    let active = device.modes.get(device.active_mode as usize).cloned();
    let active_per_led = active
        .as_ref()
        .is_some_and(|m| m.flags & FLAG_HAS_PER_LED_COLOR != 0);

    if !active_per_led {
        // Modos com cor própria (ex.: "Breathing", ou o "Static" das placas
        // ASUS) aceitam a cor direto. Para o dispositivo inteiro, usa o modo
        // atual se ele tiver cor própria, senão um "Static" com cor própria.
        let mode_specific = |m: &Mode| m.flags & FLAG_HAS_MODE_SPECIFIC_COLOR != 0;
        let target_mode = if !whole_device {
            None
        } else if active.as_ref().is_some_and(mode_specific) {
            Some(device.active_mode as usize)
        } else {
            device
                .modes
                .iter()
                .position(|m| m.name.eq_ignore_ascii_case("Static"))
                .filter(|&i| {
                    let m = &device.modes[i];
                    mode_specific(m) && m.flags & FLAG_HAS_PER_LED_COLOR == 0
                })
        };
        if let Some(idx) = target_mode {
            let mut mode = device.modes[idx].clone();
            let n = mode.colors.len().max(mode.colors_min as usize).max(1);
            mode.colors = vec![color; n];
            mode.color_mode = COLOR_MODE_MODE_SPECIFIC;
            client.update_mode(index, idx as i32, &mode, false)?;
            let switched = idx as i32 != device.active_mode;
            let mut device = client.controller_data(index)?;
            device.active_mode = idx as i32;
            return Ok(ApplyOutcome {
                device,
                switched_to: switched.then_some(mode.name),
            });
        }

        match pick_paint_mode(&device) {
            Some(idx) => {
                let mut mode = device.modes[idx].clone();
                mode.color_mode = COLOR_MODE_PER_LED;
                client.update_mode(index, idx as i32, &mode, false)?;
                switched_to = Some(mode.name);
            }
            None => {
                client.set_custom_mode(index)?;
                switched_to = Some("Custom".into());
            }
        }
        device = client.controller_data(index)?;
    }

    let mut colors = device.colors.clone();
    match (zone, leds) {
        (_, Some(leds)) => {
            for i in leds {
                if let Some(c) = colors.get_mut(i as usize) {
                    *c = color;
                }
            }
        }
        (Some(z), None) => {
            if let Some(zone) = device.zones.get(z as usize) {
                let start = zone.start_idx as usize;
                let end = (start + zone.leds_count as usize).min(colors.len());
                colors[start..end].fill(color);
            }
        }
        (None, None) => colors.fill(color),
    }
    client.update_leds(index, &colors)?;

    // Alguns controladores não informam as cores de volta; devolve o que
    // foi enviado para a interface refletir a mudança.
    device.colors = colors;
    if let Some(name) = &switched_to {
        if let Some(idx) = device.modes.iter().position(|m| &m.name == name) {
            device.active_mode = idx as i32;
        }
    }
    Ok(ApplyOutcome { device, switched_to })
}

#[tauri::command]
async fn apply_color(
    app: AppHandle,
    state: State<'_, AppState>,
    index: u32,
    color: Color,
    zone: Option<u32>,
    leds: Option<Vec<u32>>,
) -> CmdResult<ApplyOutcome> {
    with_client(&app, &state, move |c| paint(c, index, color, zone, leds)).await
}

#[tauri::command]
async fn apply_color_all(
    app: AppHandle,
    state: State<'_, AppState>,
    color: Color,
) -> CmdResult<Vec<ApplyOutcome>> {
    with_client(&app, &state, move |c| {
        let count = c.controller_count()?;
        (0..count).map(|i| paint(c, i, color, None, None)).collect()
    })
    .await
}

#[tauri::command]
async fn set_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    index: u32,
    mode_index: i32,
    mode: Mode,
    save: bool,
) -> CmdResult<Device> {
    with_client(&app, &state, move |c| {
        c.update_mode(index, mode_index, &mode, save)?;
        let mut device = c.controller_data(index)?;
        device.active_mode = mode_index;
        Ok(device)
    })
    .await
}

#[tauri::command]
async fn set_leds(
    app: AppHandle,
    state: State<'_, AppState>,
    index: u32,
    colors: Vec<Color>,
) -> CmdResult<()> {
    with_client(&app, &state, move |c| c.update_leds(index, &colors)).await
}

#[tauri::command]
async fn resize_zone(
    app: AppHandle,
    state: State<'_, AppState>,
    index: u32,
    zone: u32,
    size: u32,
) -> CmdResult<Device> {
    with_client(&app, &state, move |c| {
        let device = c.controller_data(index)?;
        let z = device
            .zones
            .get(zone as usize)
            .ok_or_else(|| openrgb::Error::Protocol(format!("zona {zone} não existe")))?;
        if size < z.leds_min || size > z.leds_max {
            return Err(openrgb::Error::Protocol(format!(
                "o tamanho da zona \"{}\" deve ficar entre {} e {} LEDs",
                z.name, z.leds_min, z.leds_max
            )));
        }
        c.resize_zone(index, zone as i32, size as i32)?;
        c.controller_data(index)
    })
    .await
}

#[tauri::command]
fn load_config() -> scene::Config {
    scene::load_config()
}

#[tauri::command]
fn save_config(config: scene::Config) -> CmdResult<()> {
    scene::save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn capture_boot_scene(app: AppHandle, state: State<'_, AppState>) -> CmdResult<scene::Config> {
    let devices = with_client(&app, &state, |c| c.devices()).await?;
    let mut config = scene::load_config();
    config.boot_scene = scene::capture(&devices);
    scene::save_config(&config).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
async fn apply_boot_scene(app: AppHandle, state: State<'_, AppState>) -> CmdResult<scene::SceneReport> {
    let saved = scene::load_config().boot_scene;
    with_client(&app, &state, move |c| scene::apply(c, &saved)).await
}

#[tauri::command]
async fn system_status() -> CmdResult<system::SystemStatus> {
    tauri::async_runtime::spawn_blocking(system::status)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn start_server(path: String, port: u16) -> CmdResult<()> {
    system::start_server(&path, port)
}

/// Sobe o serviço do servidor se ele estiver instalado e parado. Devolve
/// `true` se foi iniciado agora (e portanto será parado ao fechar o app).
#[tauri::command]
async fn ensure_server(state: State<'_, AppState>) -> CmdResult<bool> {
    let started = tauri::async_runtime::spawn_blocking(system::start_service)
        .await
        .map_err(|e| e.to_string())??;
    if started {
        state.started_server.store(true, Ordering::SeqCst);
    }
    Ok(started)
}

#[tauri::command]
async fn install_service(state: State<'_, AppState>, path: String, port: u16, at_boot: bool) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || system::install_service(&path, port, at_boot))
        .await
        .map_err(|e| e.to_string())??;
    // A instalação encerra o servidor que estava rodando; daqui em diante
    // o ciclo de vida é do serviço.
    state.started_server.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn remove_service() -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(system::remove_service)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn set_autostart(enabled: bool) -> CmdResult<()> {
    system::set_autostart(enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            let shared = app.state::<AppState>().client.clone();
            spawn_watcher(app.handle().clone(), shared);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect,
            disconnect,
            list_devices,
            rescan,
            apply_color,
            apply_color_all,
            set_mode,
            set_leds,
            resize_zone,
            load_config,
            save_config,
            capture_boot_scene,
            apply_boot_scene,
            system_status,
            start_server,
            install_service,
            remove_service,
            set_autostart,
            ensure_server,
        ])
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o RGB Control")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let state = app.state::<AppState>();
                if state.started_server.load(Ordering::SeqCst) {
                    *state.client.lock().unwrap() = None;
                    system::stop_service();
                }
            }
        });
}
