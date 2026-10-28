import { Layers, RefreshCw, Settings } from "lucide-react";
import type { Device } from "../api";
import { deviceSwatch } from "../color";
import { DeviceIcon, deviceTypeLabel, modeLabel } from "./deviceMeta";

export type Selection = number | "all";

type Props = {
  devices: Device[];
  selected: Selection;
  onSelect: (s: Selection) => void;
  connected: boolean;
  busyRescan: boolean;
  onRescan: () => void;
  onOpenSettings: () => void;
};

export function Sidebar({ devices, selected, onSelect, connected, busyRescan, onRescan, onOpenSettings }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <div className="brand-name">RGB Control</div>
          <div className={`status ${connected ? "on" : "off"}`}>
            <span className="status-dot" aria-hidden />
            {connected ? "Conectado ao OpenRGB" : "Desconectado"}
          </div>
        </div>
      </div>

      <div className="sidebar-section-head">
        <span>Dispositivos</span>
        <button
          className="icon-btn ghost"
          onClick={onRescan}
          disabled={!connected || busyRescan}
          aria-label="Procurar dispositivos novamente"
          title="Procurar dispositivos novamente"
        >
          <RefreshCw size={16} className={busyRescan ? "spin" : undefined} />
        </button>
      </div>

      <nav className="device-list" aria-label="Dispositivos">
        {devices.length > 1 && (
          <button
            className={`device-item ${selected === "all" ? "active" : ""}`}
            onClick={() => onSelect("all")}
            aria-current={selected === "all" ? "page" : undefined}
          >
            <span className="device-icon">
              <Layers size={18} aria-hidden />
            </span>
            <span className="device-text">
              <span className="device-name">Todos os dispositivos</span>
              <span className="device-sub">Mesma cor em tudo</span>
            </span>
          </button>
        )}

        {devices.map((d) => {
          const swatch = deviceSwatch(d);
          const mode = d.modes[d.activeMode];
          return (
            <button
              key={`${d.index}-${d.name}`}
              className={`device-item ${selected === d.index ? "active" : ""}`}
              onClick={() => onSelect(d.index)}
              aria-current={selected === d.index ? "page" : undefined}
            >
              <span className="device-icon">
                <DeviceIcon type={d.deviceType} />
              </span>
              <span className="device-text">
                <span className="device-name" title={d.name}>
                  {d.name}
                </span>
                <span className="device-sub">
                  {deviceTypeLabel(d.deviceType)}
                  {mode ? ` · ${modeLabel(mode.name)}` : ""}
                </span>
              </span>
              {swatch ? (
                <span
                  className={`swatch-dot ${swatch === "#000000" ? "off" : ""}`}
                  style={{ background: swatch, color: swatch }}
                  aria-hidden
                />
              ) : (
                <span className="swatch-dot multi" aria-hidden />
              )}
            </button>
          );
        })}

        {connected && devices.length === 0 && (
          <p className="muted small pad">Nenhum dispositivo encontrado. Tente procurar novamente.</p>
        )}
      </nav>

      <button className="sidebar-footer-btn" onClick={onOpenSettings}>
        <Settings size={18} aria-hidden />
        Configurações
      </button>
    </aside>
  );
}
