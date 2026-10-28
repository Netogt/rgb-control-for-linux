import { useEffect, useState } from "react";
import type { Device, Zone } from "../api";
import { colorToHex } from "../color";

export type Target = { kind: "device" } | { kind: "zone"; zone: number } | { kind: "leds"; leds: number[] };

type Props = {
  device: Device;
  target: Target;
  onChange: (t: Target) => void;
  onResizeZone: (zone: number, size: number) => Promise<void>;
};

/** Campo para informar quantos LEDs tem a fita ligada num header ARGB. */
function ZoneSize({ zone, onResize }: { zone: Zone; onResize: (size: number) => Promise<void> }) {
  const [draft, setDraft] = useState(String(zone.ledsCount));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(String(zone.ledsCount)), [zone.ledsCount]);

  const n = Number(draft);
  const valid = Number.isInteger(n) && n >= zone.ledsMin && n <= zone.ledsMax;
  const changed = valid && n !== zone.ledsCount;

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    await onResize(n);
    setSaving(false);
  };

  return (
    <div className="zone-size">
      <label className="zone-size-field">
        <span>Tamanho</span>
        <input
          type="number"
          min={zone.ledsMin}
          max={zone.ledsMax}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          aria-invalid={!valid}
          aria-describedby={`zone-size-hint-${zone.name}`}
        />
        <span>LEDs</span>
      </label>
      <button className="btn small" onClick={save} disabled={!changed || saving}>
        {saving ? "Salvando…" : "Definir"}
      </button>
      <span id={`zone-size-hint-${zone.name}`} className="muted small">
        {zone.ledsMin}–{zone.ledsMax}
      </span>
    </div>
  );
}

export function targetLabel(device: Device, t: Target): string {
  if (t.kind === "zone") return `zona "${device.zones[t.zone]?.name ?? t.zone}"`;
  if (t.kind === "leds") return t.leds.length === 1 ? "1 LED" : `${t.leds.length} LEDs`;
  return "dispositivo inteiro";
}

export function TargetPanel({ device, target, onChange, onResizeZone }: Props) {
  const multiZone = device.zones.length > 1;
  const selectedLeds = new Set(target.kind === "leds" ? target.leds : []);
  const lastClicked = target.kind === "leds" ? target.leds[target.leds.length - 1] : undefined;

  const toggleLed = (i: number, range: boolean) => {
    const set = new Set(selectedLeds);
    if (range && lastClicked !== undefined) {
      const [a, b] = [Math.min(lastClicked, i), Math.max(lastClicked, i)];
      for (let k = a; k <= b; k++) set.add(k);
    } else if (set.has(i)) {
      set.delete(i);
    } else {
      set.add(i);
    }
    // Mantém o último clicado no fim para o Shift+clique funcionar.
    const leds = [...set].filter((k) => k !== i);
    if (set.has(i)) leds.push(i);
    onChange({ kind: "leds", leds });
  };

  const options: { kind: Target["kind"]; label: string }[] = [
    { kind: "device", label: "Dispositivo inteiro" },
    ...(multiZone ? [{ kind: "zone" as const, label: "Zona" }] : []),
    { kind: "leds", label: "LEDs" },
  ];

  return (
    <section className="card" aria-labelledby="target-title">
      <header className="card-head">
        <h2 id="target-title">Área</h2>
        <div className="segmented" role="radiogroup" aria-label="Onde aplicar a cor">
          {options.map((o) => (
            <button
              key={o.kind}
              role="radio"
              aria-checked={target.kind === o.kind}
              className={target.kind === o.kind ? "active" : ""}
              onClick={() => {
                if (o.kind === target.kind) return;
                if (o.kind === "zone") onChange({ kind: "zone", zone: 0 });
                else if (o.kind === "leds") onChange({ kind: "leds", leds: [] });
                else onChange({ kind: "device" });
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </header>

      <div className="zones">
        {device.zones.map((z, zi) => {
          const zoneActive = target.kind === "device" || (target.kind === "zone" && target.zone === zi);
          const leds = Array.from({ length: z.ledsCount }, (_, k) => z.startIdx + k);
          return (
            <div key={`${zi}-${z.name}`} className={`zone ${zoneActive ? "active" : ""}`}>
              <button
                className="zone-head"
                onClick={() => onChange({ kind: "zone", zone: zi })}
                disabled={!multiZone}
                aria-pressed={target.kind === "zone" && target.zone === zi}
              >
                <span>{z.name}</span>
                <span className="muted small">{z.ledsCount === 1 ? "1 LED" : `${z.ledsCount} LEDs`}</span>
              </button>
              {z.ledsCount === 0 && (
                <p className="hint zone-empty">
                  Nenhum LED configurado. Informe quantos LEDs tem a fita ligada neste conector; o valor fica salvo no
                  servidor.
                </p>
              )}
              <div className="led-strip">
                {leds.map((i) => {
                  const c = device.colors[i];
                  const selected = selectedLeds.has(i);
                  return (
                    <button
                      key={i}
                      className={`led ${selected ? "selected" : ""}`}
                      style={{ ["--led" as string]: c ? colorToHex(c) : "#000" }}
                      onClick={(e) => toggleLed(i, e.shiftKey)}
                      title={device.leds[i] ?? `LED ${i + 1}`}
                      aria-label={`${device.leds[i] ?? `LED ${i + 1}`}${selected ? ", selecionado" : ""}`}
                      aria-pressed={selected}
                    />
                  );
                })}
              </div>
              {z.ledsMin !== z.ledsMax && <ZoneSize zone={z} onResize={(size) => onResizeZone(zi, size)} />}
            </div>
          );
        })}
      </div>

      {target.kind === "leds" && (
        <div className="target-foot">
          <span className="muted small">
            {target.leds.length === 0 ? "Clique nos LEDs para selecionar (Shift seleciona um intervalo)." : `${target.leds.length} selecionado(s)`}
          </span>
          <div className="row gap-s">
            <button className="text-btn" onClick={() => onChange({ kind: "leds", leds: device.leds.map((_, i) => i) })}>
              Selecionar todos
            </button>
            <button className="text-btn" onClick={() => onChange({ kind: "leds", leds: [] })} disabled={target.leds.length === 0}>
              Limpar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
