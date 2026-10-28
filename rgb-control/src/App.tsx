import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, onConnection, onDevicesChanged, type Config, type Device, type Mode, type SystemStatus } from "./api";
import { colorToHex, deviceSwatch, hexToColor, visibleColors } from "./color";
import { useInterval, useLatestSender, useToasts } from "./hooks";
import { Sidebar, type Selection } from "./components/Sidebar";
import { ColorPanel } from "./components/ColorPanel";
import { EffectPanel } from "./components/EffectPanel";
import { TargetPanel, targetLabel, type Target } from "./components/TargetPanel";
import { ConnectScreen } from "./components/ConnectScreen";
import { SettingsDrawer, type Busy } from "./components/SettingsDrawer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Toasts } from "./components/Toasts";
import { DeviceIcon, deviceTypeLabel, modeLabel } from "./components/deviceMeta";

type ConnState = "idle" | "connecting" | "connected" | "disconnected";
type Confirm = { title: string; body: string; confirmLabel: string; danger?: boolean; action: () => void };

const MAX_RECENT = 10;

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [conn, setConn] = useState<ConnState>("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<{ client: number; server: number } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Selection>("all");
  const [target, setTarget] = useState<Target>({ kind: "device" });
  const [color, setColor] = useState("#ff0000");
  const [applying, setApplying] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [startingServer, setStartingServer] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const configRef = useRef<Config | null>(null);
  configRef.current = config;

  const device = typeof selected === "number" ? devices.find((d) => d.index === selected) ?? null : null;
  const connected = conn === "connected";

  // ---------- configuração ----------

  const saveTimer = useRef<number | undefined>(undefined);
  const updateConfig = useCallback((patch: Partial<Config>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        api.saveConfig(next).catch((e) => push("error", `Não foi possível salvar as configurações: ${errorMessage(e)}`));
      }, 400);
      return next;
    });
  }, [push]);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.systemStatus();
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  // ---------- conexão ----------

  const connect = useCallback(
    async (silent = false) => {
      const cfg = configRef.current;
      if (!cfg) return false;
      setConn("connecting");
      if (!silent) setBusy("connect");
      try {
        const info = await api.connect(cfg.host, cfg.port);
        setDevices(info.devices);
        setProtocol({ client: info.protocol, server: info.serverProtocol });
        setConn("connected");
        setConnError(null);
        setSelected((sel) =>
          sel === "all" && info.devices.length === 1 ? info.devices[0].index : sel,
        );
        if (!silent) push("success", `Conectado: ${info.devices.length} dispositivo(s) encontrado(s).`);
        return true;
      } catch (e) {
        setConn("disconnected");
        setConnError(errorMessage(e));
        if (!silent) push("error", errorMessage(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [push],
  );

  /** O servidor demora alguns segundos detectando dispositivos. */
  const waitForServer = useCallback(async () => {
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (await connect(true)) return true;
    }
    return false;
  }, [connect]);

  /** Sobe o serviço instalado (sem senha) e conecta; ele para quando o app fecha. */
  const startViaService = useCallback(
    async (silent: boolean) => {
      setStartingServer(true);
      try {
        await api.ensureServer();
        const ok = await waitForServer();
        if (!ok) push("error", "O servidor OpenRGB foi iniciado mas não respondeu. Veja: journalctl -u openrgb-server");
        else if (!silent) push("success", "Servidor iniciado e conectado.");
        return ok;
      } catch (e) {
        push("error", errorMessage(e));
        return false;
      } finally {
        setStartingServer(false);
      }
    },
    [push, waitForServer],
  );

  useEffect(() => {
    (async () => {
      const [cfg, s] = await Promise.all([api.loadConfig(), refreshStatus()]);
      if (!cfg.openrgbPath && s?.openrgbCandidates.length) {
        cfg.openrgbPath = s.openrgbCandidates[0];
      }
      setConfig(cfg);
      configRef.current = cfg;
      if (!cfg.autoConnect) {
        setConn("disconnected");
        return;
      }
      if (!(await connect(true)) && s?.serviceInstalled) {
        await startViaService(true);
      }
    })();
  }, [connect, refreshStatus, startViaService]);

  useEffect(() => {
    const subs = [
      onConnection((e) => {
        if (!e.connected) {
          setConn("disconnected");
          if (e.reason) {
            setConnError(e.reason);
            push("error", e.reason);
          }
        }
      }),
      onDevicesChanged(() => {
        api.listDevices().then(setDevices).catch(() => {});
      }),
    ];
    return () => subs.forEach((p) => p.then((un) => un()));
  }, [push]);

  // Enquanto desconectado, tenta de novo a cada poucos segundos.
  useInterval(
    () => void connect(true),
    conn === "disconnected" && config?.autoConnect && !startingServer ? 4000 : null,
  );

  // ---------- seleção ----------

  useEffect(() => {
    if (selected !== "all" && devices.length > 0 && !devices.some((d) => d.index === selected)) {
      setSelected(devices.length > 1 ? "all" : devices[0].index);
    }
  }, [devices, selected]);

  // Ao trocar de dispositivo, o seletor mostra a cor atual dele.
  const lastSelected = useRef<Selection | null>(null);
  useEffect(() => {
    if (lastSelected.current === selected) return;
    lastSelected.current = selected;
    setTarget({ kind: "device" });
    if (device) {
      const hex = deviceSwatch(device);
      if (hex && hex !== "#000000") setColor(hex);
    }
  }, [selected, device]);

  // ---------- aplicar cor ----------

  const replaceDevice = (d: Device) => setDevices((list) => list.map((x) => (x.index === d.index ? d : x)));

  const announceSwitch = (name: string | null, devName: string) => {
    if (name) push("info", `${devName}: modo alterado para ${modeLabel(name)} para aceitar a cor.`);
  };

  const sendColor = useCallback(
    async (hex: string) => {
      const c = hexToColor(hex);
      if (!c || !connected) return;
      try {
        if (selected === "all") {
          const results = await api.applyColorAll(c);
          setDevices((list) => list.map((d) => results.find((r) => r.device.index === d.index)?.device ?? d));
        } else {
          if (target.kind === "leds" && target.leds.length === 0) return;
          const r = await api.applyColor(
            selected,
            c,
            target.kind === "zone" ? target.zone : undefined,
            target.kind === "leds" ? target.leds : undefined,
          );
          replaceDevice(r.device);
          announceSwitch(r.switchedTo, r.device.name);
        }
      } catch (e) {
        push("error", errorMessage(e));
      }
    },
    [connected, selected, target, push],
  );

  const liveSend = useLatestSender(sendColor);

  const onColorChange = (hex: string) => {
    setColor(hex);
    if (config?.livePreview) liveSend(hex);
  };

  const rememberColor = (hex: string) => {
    if (!config) return;
    const recent = [hex, ...config.recent.filter((r) => r !== hex)].slice(0, MAX_RECENT);
    if (recent.join() !== config.recent.join()) updateConfig({ recent });
  };

  const onColorCommit = (hex: string) => {
    if (config?.livePreview) liveSend(hex);
    rememberColor(hex);
  };

  const applyNow = async () => {
    setApplying(true);
    await sendColor(color);
    rememberColor(color);
    setApplying(false);
  };

  // ---------- modos ----------

  const sendMode = useLatestSender(async ({ index, modeIndex, mode }: { index: number; modeIndex: number; mode: Mode }) => {
    try {
      replaceDevice(await api.setMode(index, modeIndex, mode));
    } catch (e) {
      push("error", errorMessage(e));
    }
  });

  const selectMode = (modeIndex: number) => {
    if (!device) return;
    const mode = device.modes[modeIndex];
    replaceDevice({ ...device, activeMode: modeIndex });
    sendMode({ index: device.index, modeIndex, mode });
  };

  const changeMode = (mode: Mode) => {
    if (!device) return;
    const modes = device.modes.slice();
    modes[device.activeMode] = mode;
    replaceDevice({ ...device, modes });
    sendMode({ index: device.index, modeIndex: device.activeMode, mode });
  };

  const saveMode = async () => {
    if (!device) return;
    try {
      replaceDevice(await api.setMode(device.index, device.activeMode, device.modes[device.activeMode], true));
      push("success", "Modo gravado no dispositivo.");
    } catch (e) {
      push("error", errorMessage(e));
    }
  };

  const resizeZone = async (zone: number, size: number) => {
    if (!device) return;
    try {
      const updated = await api.resizeZone(device.index, zone, size);
      replaceDevice(updated);
      setTarget({ kind: "zone", zone });
      push("success", `"${updated.zones[zone]?.name}" agora tem ${size} LED(s). Escolha uma cor para acendê-los.`);
    } catch (e) {
      push("error", errorMessage(e));
    }
  };

  // ---------- ações do sistema ----------

  const rescan = async () => {
    setRescanning(true);
    try {
      await api.rescan();
      // A detecção roda em segundo plano no servidor; o aviso
      // "devices-changed" atualiza a lista quando terminar.
      push("info", "Procurando dispositivos…");
    } catch (e) {
      push("error", errorMessage(e));
    } finally {
      window.setTimeout(() => setRescanning(false), 3000);
    }
  };

  const startServer = async () => {
    if (status?.serviceInstalled) {
      setBusy("server");
      await startViaService(false);
      setBusy(null);
      void refreshStatus();
      return;
    }
    if (!config?.openrgbPath) {
      setSettingsOpen(true);
      return;
    }
    setStartingServer(true);
    setBusy("server");
    try {
      await api.startServer(config.openrgbPath, config.port);
      if (await waitForServer()) push("success", "Servidor iniciado e conectado.");
      else push("error", "O servidor não respondeu. A senha foi cancelada ou o OpenRGB falhou ao iniciar.");
    } catch (e) {
      push("error", errorMessage(e));
    } finally {
      setStartingServer(false);
      setBusy(null);
    }
  };

  const installService = (atBoot: boolean) => {
    if (!config) return;
    setConfirm({
      title: atBoot ? "Manter o servidor sempre ligado?" : "Abrir o servidor junto com o app?",
      body: atBoot
        ? "O OpenRGB será copiado para /usr/local/bin e um serviço systemd vai mantê-lo rodando como root desde a inicialização. Qualquer OpenRGB aberto agora será fechado. Vai pedir sua senha uma vez."
        : "O OpenRGB será copiado para /usr/local/bin e instalado como serviço que não inicia no boot. Uma regra do polkit deixa seu usuário iniciar e parar só esse serviço sem senha: o app sobe o servidor ao abrir e para ao fechar. Qualquer OpenRGB aberto agora será fechado. Vai pedir sua senha uma vez.",
      confirmLabel: "Instalar",
      action: async () => {
        setBusy("service");
        try {
          await api.installService(config.openrgbPath, config.port, atBoot);
          push("success", atBoot ? "Serviço instalado e ativo desde o boot." : "Pronto: o servidor agora abre e fecha com o app.");
          if (atBoot) {
            if (!(await waitForServer())) push("error", "O serviço não respondeu. Veja: journalctl -u openrgb-server");
          } else {
            await startViaService(true);
          }
        } catch (e) {
          push("error", errorMessage(e));
        } finally {
          setBusy(null);
          void refreshStatus();
        }
      },
    });
  };

  const removeService = () => {
    setConfirm({
      title: "Remover serviço?",
      body: "O servidor OpenRGB vai parar agora e não vai mais iniciar no boot.",
      confirmLabel: "Remover",
      danger: true,
      action: async () => {
        setBusy("service");
        try {
          await api.removeService();
          push("success", "Serviço removido.");
        } catch (e) {
          push("error", errorMessage(e));
        } finally {
          setBusy(null);
          void refreshStatus();
        }
      },
    });
  };

  const captureScene = async () => {
    setBusy("scene");
    try {
      const cfg = await api.captureBootScene();
      setConfig((prev) => (prev ? { ...prev, bootScene: cfg.bootScene } : prev));
      push("success", `Cena inicial salva com ${cfg.bootScene.length} dispositivo(s).`);
    } catch (e) {
      push("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const applyScene = async () => {
    setBusy("apply-scene");
    try {
      const r = await api.applyBootScene();
      setDevices(await api.listDevices());
      push(r.missing.length ? "info" : "success",
        r.missing.length
          ? `Aplicada em ${r.applied.length}; não encontrados: ${r.missing.join(", ")}.`
          : `Cena aplicada em ${r.applied.length} dispositivo(s).`);
    } catch (e) {
      push("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleAutostart = async (enabled: boolean) => {
    setBusy("autostart");
    try {
      await api.setAutostart(enabled);
      push("success", enabled ? "A cena será aplicada ao iniciar a sessão." : "Autostart desativado.");
    } catch (e) {
      push("error", errorMessage(e));
    } finally {
      setBusy(null);
      void refreshStatus();
    }
  };

  const openSettings = () => {
    setSettingsOpen(true);
    void refreshStatus();
  };

  // ---------- render ----------

  const applyLabel = useMemo(() => {
    if (selected === "all") return "Aplicar em todos os dispositivos";
    if (!device) return "Aplicar";
    if (target.kind === "leds" && target.leds.length === 0) return "Selecione LEDs para aplicar";
    return `Aplicar no ${targetLabel(device, target)}`;
  }, [selected, device, target]);

  if (!config) {
    return <div className="boot-splash" aria-busy="true" />;
  }

  const showConnect = !connected;
  const totalLeds = device?.leds.length ?? 0;

  return (
    <div className="app" style={{ ["--current" as string]: color }}>
      <Sidebar
        devices={devices}
        selected={selected}
        onSelect={setSelected}
        connected={connected}
        busyRescan={rescanning}
        onRescan={rescan}
        onOpenSettings={openSettings}
      />

      <main className="main">
        {showConnect ? (
          <ConnectScreen
            connecting={conn === "connecting" || conn === "idle"}
            error={connError}
            host={config.host}
            port={config.port}
            serverPath={config.openrgbPath}
            canStartServer={!!status?.serviceInstalled || (!!config.openrgbPath && !!status?.pkexec)}
            startingServer={startingServer}
            onConnect={() => void connect()}
            onStartServer={startServer}
            onOpenSettings={openSettings}
          />
        ) : (
          <>
            <header className="main-head">
              {device ? (
                <>
                  <span className="head-icon">
                    <DeviceIcon type={device.deviceType} size={22} />
                  </span>
                  <div className="grow">
                    <h1>{device.name}</h1>
                    <p className="muted small">
                      {[deviceTypeLabel(device.deviceType), device.vendor, device.location, `${totalLeds} LED(s)`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </>
              ) : (
                <div className="grow">
                  <h1>Todos os dispositivos</h1>
                  <p className="muted small">A cor escolhida é aplicada em {devices.length} dispositivos ao mesmo tempo.</p>
                </div>
              )}
              <label className="live-toggle">
                <input
                  type="checkbox"
                  checked={config.livePreview}
                  onChange={(e) => updateConfig({ livePreview: e.target.checked })}
                />
                Prévia ao vivo
              </label>
            </header>

            <div className="content">
              <div className="col">
                <ColorPanel
                  color={color}
                  onChange={onColorChange}
                  onCommit={onColorCommit}
                  livePreview={config.livePreview}
                  onApply={applyNow}
                  applying={applying}
                  applyLabel={applyLabel}
                  favorites={config.favorites}
                  recent={config.recent}
                  onFavoritesChange={(favorites) => updateConfig({ favorites })}
                />
              </div>

              <div className="col">
                {device ? (
                  <>
                    <EffectPanel
                      device={device}
                      pickerColor={hexToColor(color) ?? { r: 0, g: 0, b: 0 }}
                      onSelectMode={selectMode}
                      onModeChange={changeMode}
                      onSave={saveMode}
                    />
                    {(totalLeds > 1 || device.zones.some((z) => z.ledsMin !== z.ledsMax)) && (
                      <TargetPanel device={device} target={target} onChange={setTarget} onResizeZone={resizeZone} />
                    )}
                  </>
                ) : (
                  <section className="card" aria-labelledby="overview-title">
                    <header className="card-head">
                      <h2 id="overview-title">Visão geral</h2>
                    </header>
                    <ul className="overview">
                      {devices.map((d) => {
                        const visible = visibleColors(d);
                        const ledCount = Math.min(Math.max(d.leds.length, 1), 24);
                        // Cor do modo vale para todos os LEDs; por LED, cada um tem a sua.
                        const preview =
                          visible === null
                            ? null
                            : visible.length === 0
                              ? Array.from({ length: ledCount }, () => "#000000")
                              : visible.length < ledCount && visible !== d.colors
                                ? Array.from({ length: ledCount }, (_, i) => colorToHex(visible[i % visible.length]))
                                : visible.slice(0, 24).map(colorToHex);
                        return (
                          <li key={d.index}>
                            <button className="overview-item" onClick={() => setSelected(d.index)}>
                              <span className="device-icon">
                                <DeviceIcon type={d.deviceType} />
                              </span>
                              <span className="grow">
                                <span className="device-name">{d.name}</span>
                                <span className="device-sub">{modeLabel(d.modes[d.activeMode]?.name ?? "")}</span>
                              </span>
                              <span className="led-preview" aria-hidden>
                                {preview === null ? (
                                  <span className="multi" />
                                ) : (
                                  preview.map((hex, i) => (
                                    <span key={i} className={hex === "#000000" ? "off" : undefined} style={{ background: hex }} />
                                  ))
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="hint">
                      Dispositivos em modos de efeito são trocados para "Estático" para receber a cor. Escolha um
                      dispositivo para ajustar efeitos, zonas ou LEDs individuais.
                    </p>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {settingsOpen && (
        <SettingsDrawer
          config={config}
          onConfigChange={updateConfig}
          status={status}
          connected={connected}
          protocol={protocol}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onConnect={() => void connect()}
          onDisconnect={() => {
            void api.disconnect();
            updateConfig({ autoConnect: false });
          }}
          onStartServer={startServer}
          onInstallService={installService}
          onRemoveService={removeService}
          onCaptureScene={captureScene}
          onApplyScene={applyScene}
          onToggleAutostart={toggleAutostart}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm.action;
            setConfirm(null);
            action();
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
