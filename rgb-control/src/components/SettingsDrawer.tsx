import { useEffect, useRef, useState } from "react";
import { Camera, Play, Power, X } from "lucide-react";
import type { Config, SystemStatus } from "../api";
import { modeLabel } from "./deviceMeta";

export type Busy = null | "connect" | "server" | "service" | "scene" | "apply-scene" | "autostart";

type Props = {
  config: Config;
  onConfigChange: (patch: Partial<Config>) => void;
  status: SystemStatus | null;
  connected: boolean;
  protocol: { client: number; server: number } | null;
  busy: Busy;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onStartServer: () => void;
  onInstallService: (atBoot: boolean) => void;
  onRemoveService: () => void;
  onCaptureScene: () => void;
  onApplyScene: () => void;
  onToggleAutostart: (enabled: boolean) => void;
};

type ServerMode = "manual" | "with-app" | "always";

const SERVER_MODES: { value: ServerMode; title: string; hint: string; recommended?: boolean }[] = [
  {
    value: "with-app",
    title: "Junto com o app",
    hint: "Abre quando você abre o app e fecha quando você fecha. Sem pedir senha.",
    recommended: true,
  },
  {
    value: "always",
    title: "Sempre ligado",
    hint: "Inicia no boot e fica em segundo plano; o app conecta na hora.",
  },
  {
    value: "manual",
    title: "Manual",
    hint: "Nada instalado: você inicia o servidor pelo terminal ou com senha.",
  },
];

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="switch-thumb" />
    </button>
  );
}

function Badge({ ok, okText, offText }: { ok: boolean; okText: string; offText: string }) {
  return <span className={`badge ${ok ? "ok" : ""}`}>{ok ? okText : offText}</span>;
}

export function SettingsDrawer(p: Props) {
  const { config, status } = p;
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(String(config.port));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.onClose]);

  const commitConnection = () => {
    const n = Number(port);
    const validPort = Number.isInteger(n) && n > 0 && n < 65536 ? n : config.port;
    setPort(String(validPort));
    p.onConfigChange({ host: host.trim() || "127.0.0.1", port: validPort });
  };

  const candidates = status?.openrgbCandidates ?? [];
  const currentMode: ServerMode = !status?.serviceInstalled ? "manual" : status.serviceEnabled ? "always" : "with-app";
  const scene = config.bootScene;

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={panelRef} tabIndex={-1}>
        <header className="drawer-head">
          <h2 id="settings-title">Configurações</h2>
          <button className="icon-btn ghost" onClick={p.onClose} aria-label="Fechar configurações">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body">
          <section className="settings-section">
            <h3>Conexão</h3>
            <div className="row gap-s">
              <label className="field grow">
                <span>Endereço</span>
                <input value={host} onChange={(e) => setHost(e.target.value)} onBlur={commitConnection} />
              </label>
              <label className="field port-field">
                <span>Porta</span>
                <input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} onBlur={commitConnection} />
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div>Conectar ao abrir</div>
                <div className="hint">Tenta conectar automaticamente quando o app inicia.</div>
              </div>
              <Switch label="Conectar ao abrir" checked={config.autoConnect} onChange={(v) => p.onConfigChange({ autoConnect: v })} />
            </div>
            <div className="setting-row">
              <div>
                <div>{p.connected ? "Conectado" : "Desconectado"}</div>
                {p.protocol && p.connected && (
                  <div className="hint">
                    Protocolo SDK {p.protocol.client} (servidor suporta até {p.protocol.server})
                  </div>
                )}
              </div>
              {p.connected ? (
                <button className="btn subtle small" onClick={p.onDisconnect}>
                  Desconectar
                </button>
              ) : (
                <button className="btn small" onClick={p.onConnect} disabled={p.busy === "connect"}>
                  {p.busy === "connect" ? "Conectando…" : "Conectar"}
                </button>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h3>Servidor OpenRGB</h3>
            <label className="field">
              <span>Executável (build com o detector do S20G)</span>
              <input
                list="openrgb-candidates"
                value={config.openrgbPath}
                placeholder="/home/…/OpenRGB/openrgb"
                onChange={(e) => p.onConfigChange({ openrgbPath: e.target.value })}
                spellCheck={false}
              />
              <datalist id="openrgb-candidates">
                {candidates.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            {candidates.length > 0 && !config.openrgbPath && (
              <button className="text-btn" onClick={() => p.onConfigChange({ openrgbPath: candidates[0] })}>
                Usar {candidates[0]}
              </button>
            )}

            <div className="param">
              <div className="row gap-s">
                <span>Como o servidor roda</span>
                {status && (
                  <Badge ok={status.serviceActive} okText="Rodando" offText="Parado" />
                )}
              </div>
              <div className="option-list" role="radiogroup" aria-label="Como o servidor roda">
                {SERVER_MODES.map((m) => {
                  const checked = currentMode === m.value;
                  return (
                    <button
                      key={m.value}
                      role="radio"
                      aria-checked={checked}
                      className={`option ${checked ? "active" : ""}`}
                      disabled={p.busy === "service" || (m.value !== "manual" && (!config.openrgbPath || !status?.pkexec))}
                      onClick={() => {
                        if (checked) return;
                        if (m.value === "manual") p.onRemoveService();
                        else p.onInstallService(m.value === "always");
                      }}
                    >
                      <span className="option-radio" aria-hidden />
                      <span>
                        <span className="option-title">
                          {m.title}
                          {m.recommended && <span className="badge ok">Recomendado</span>}
                        </span>
                        <span className="hint">{m.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {p.busy === "service" && <p className="hint">Aplicando… confirme a senha na janela do sistema.</p>}
            </div>

            {!status?.serviceActive && (
              <div className="setting-row">
                <div>
                  <div>Iniciar agora</div>
                  <div className="hint">
                    {status?.serviceInstalled ? "Sobe o serviço sem pedir senha." : "Roda o servidor como root até desligar o PC. Pede sua senha."}
                  </div>
                </div>
                <button
                  className="btn small"
                  onClick={p.onStartServer}
                  disabled={p.busy === "server" || (!status?.serviceInstalled && (!config.openrgbPath || !status?.pkexec))}
                >
                  <Power size={14} aria-hidden /> Iniciar
                </button>
              </div>
            )}
            {status && !status.pkexec && <p className="hint warn">O pkexec (polkit) não foi encontrado; use o terminal.</p>}
          </section>

          <section className="settings-section">
            <h3>Cena inicial</h3>
            <p className="hint">
              O SSD volta ao arco-íris quando perde energia. A cena inicial guarda modo e cores de cada dispositivo para
              reaplicar quando a sessão começa.
            </p>
            {scene.length > 0 ? (
              <ul className="scene-list">
                {scene.map((s) => (
                  <li key={`${s.name}-${s.location}`}>
                    <span>{s.name}</span>
                    <span className="muted small">{modeLabel(s.modeName)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nenhuma cena salva ainda.</p>
            )}
            <div className="row gap-s wrap">
              <button className="btn small" onClick={p.onCaptureScene} disabled={!p.connected || p.busy === "scene"}>
                <Camera size={14} aria-hidden /> Salvar estado atual
              </button>
              <button className="btn subtle small" onClick={p.onApplyScene} disabled={!p.connected || scene.length === 0 || p.busy === "apply-scene"}>
                <Play size={14} aria-hidden /> Aplicar agora
              </button>
            </div>
            <div className="setting-row">
              <div>
                <div>Reaplicar ao iniciar a sessão</div>
                <div className="hint">Cria uma entrada de autostart que aplica a cena sem abrir a janela.</div>
              </div>
              <Switch
                label="Reaplicar ao iniciar a sessão"
                checked={!!status?.autostart}
                onChange={p.onToggleAutostart}
                disabled={p.busy === "autostart" || (scene.length === 0 && !status?.autostart)}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>Comportamento</h3>
            <div className="setting-row">
              <div>
                <div>Prévia ao vivo</div>
                <div className="hint">Envia a cor enquanto você arrasta o seletor.</div>
              </div>
              <Switch label="Prévia ao vivo" checked={config.livePreview} onChange={(v) => p.onConfigChange({ livePreview: v })} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
