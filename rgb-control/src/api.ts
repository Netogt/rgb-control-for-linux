import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Color = { r: number; g: number; b: number };

export type Mode = {
  name: string;
  value: number;
  flags: number;
  speedMin: number;
  speedMax: number;
  brightnessMin: number;
  brightnessMax: number;
  colorsMin: number;
  colorsMax: number;
  speed: number;
  brightness: number;
  direction: number;
  colorMode: number;
  colors: Color[];
};

export type Zone = {
  name: string;
  zoneType: number;
  ledsMin: number;
  ledsMax: number;
  ledsCount: number;
  matrix: { height: number; width: number; map: number[] } | null;
  segments: { name: string; zoneType: number; startIdx: number; ledsCount: number }[];
  startIdx: number;
};

export type Device = {
  index: number;
  deviceType: number;
  name: string;
  vendor: string;
  description: string;
  version: string;
  serial: string;
  location: string;
  activeMode: number;
  modes: Mode[];
  zones: Zone[];
  leds: string[];
  colors: Color[];
};

export type SceneDevice = {
  name: string;
  location: string;
  modeName: string;
  mode: Mode;
  colors: Color[];
};

export type Config = {
  host: string;
  port: number;
  openrgbPath: string;
  autoConnect: boolean;
  livePreview: boolean;
  favorites: string[];
  recent: string[];
  bootScene: SceneDevice[];
};

export type SystemStatus = {
  openrgbCandidates: string[];
  serviceInstalled: boolean;
  serviceEnabled: boolean;
  serviceActive: boolean;
  autostart: boolean;
  pkexec: boolean;
};

export type ConnectInfo = { protocol: number; serverProtocol: number; devices: Device[] };
export type ApplyOutcome = { device: Device; switchedTo: string | null };
export type SceneReport = { applied: string[]; missing: string[] };

/** Constantes de RGBControllerInterface.h do OpenRGB. */
export const ModeFlag = {
  HasSpeed: 1 << 0,
  HasDirectionLR: 1 << 1,
  HasDirectionUD: 1 << 2,
  HasDirectionHV: 1 << 3,
  HasBrightness: 1 << 4,
  HasPerLedColor: 1 << 5,
  HasModeSpecificColor: 1 << 6,
  HasRandomColor: 1 << 7,
  ManualSave: 1 << 8,
  AutomaticSave: 1 << 9,
} as const;

export const ColorMode = { None: 0, PerLed: 1, ModeSpecific: 2, Random: 3 } as const;

export const api = {
  connect: (host: string, port: number) => invoke<ConnectInfo>("connect", { host, port }),
  disconnect: () => invoke<void>("disconnect"),
  listDevices: () => invoke<Device[]>("list_devices"),
  rescan: () => invoke<void>("rescan"),
  applyColor: (index: number, color: Color, zone?: number, leds?: number[]) =>
    invoke<ApplyOutcome>("apply_color", { index, color, zone: zone ?? null, leds: leds ?? null }),
  applyColorAll: (color: Color) => invoke<ApplyOutcome[]>("apply_color_all", { color }),
  setMode: (index: number, modeIndex: number, mode: Mode, save = false) =>
    invoke<Device>("set_mode", { index, modeIndex, mode, save }),
  setLeds: (index: number, colors: Color[]) => invoke<void>("set_leds", { index, colors }),
  resizeZone: (index: number, zone: number, size: number) => invoke<Device>("resize_zone", { index, zone, size }),
  loadConfig: () => invoke<Config>("load_config"),
  saveConfig: (config: Config) => invoke<void>("save_config", { config }),
  captureBootScene: () => invoke<Config>("capture_boot_scene"),
  applyBootScene: () => invoke<SceneReport>("apply_boot_scene"),
  systemStatus: () => invoke<SystemStatus>("system_status"),
  startServer: (path: string, port: number) => invoke<void>("start_server", { path, port }),
  installService: (path: string, port: number, atBoot: boolean) =>
    invoke<void>("install_service", { path, port, atBoot }),
  /** Sobe o serviço instalado sem senha; `true` se foi iniciado agora. */
  ensureServer: () => invoke<boolean>("ensure_server"),
  removeService: () => invoke<void>("remove_service"),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
};

export function onConnection(cb: (e: { connected: boolean; reason: string | null }) => void): Promise<UnlistenFn> {
  return listen<{ connected: boolean; reason: string | null }>("rgb://connection", (e) => cb(e.payload));
}

export function onDevicesChanged(cb: () => void): Promise<UnlistenFn> {
  return listen("rgb://devices-changed", () => cb());
}

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
