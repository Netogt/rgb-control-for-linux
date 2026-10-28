import { Minus, Plus, Save } from "lucide-react";
import { ColorMode, ModeFlag, type Color, type Device, type Mode } from "../api";
import { colorToHex } from "../color";
import { modeLabel } from "./deviceMeta";

type Props = {
  device: Device;
  pickerColor: Color;
  onSelectMode: (modeIndex: number) => void;
  /** Mudança de parâmetro do modo ativo (velocidade, brilho…). */
  onModeChange: (mode: Mode) => void;
  onSave: () => void;
};

const DIRECTIONS: { value: number; label: string; flag: number }[] = [
  { value: 0, label: "Esquerda", flag: ModeFlag.HasDirectionLR },
  { value: 1, label: "Direita", flag: ModeFlag.HasDirectionLR },
  { value: 2, label: "Cima", flag: ModeFlag.HasDirectionUD },
  { value: 3, label: "Baixo", flag: ModeFlag.HasDirectionUD },
  { value: 4, label: "Horizontal", flag: ModeFlag.HasDirectionHV },
  { value: 5, label: "Vertical", flag: ModeFlag.HasDirectionHV },
];

function Range({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  // Alguns controladores usam escala invertida (min > max): o slider
  // continua indo de "devagar" para "rápido" visualmente.
  const inverted = min > max;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const shown = inverted ? lo + hi - value : value;
  const pct = hi === lo ? 100 : Math.round(((shown - lo) / (hi - lo)) * 100);
  return (
    <label className="range">
      <span className="range-head">
        <span>{label}</span>
        <span className="muted">{pct}%</span>
      </span>
      <input
        type="range"
        min={lo}
        max={hi}
        value={shown}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(inverted ? lo + hi - v : v);
        }}
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </label>
  );
}

export function EffectPanel({ device, pickerColor, onSelectMode, onModeChange, onSave }: Props) {
  const mode = device.modes[device.activeMode];
  const has = (f: number) => !!mode && (mode.flags & f) !== 0;

  const colorModes = mode
    ? [
        has(ModeFlag.HasPerLedColor) && { value: ColorMode.PerLed, label: "Por LED" },
        has(ModeFlag.HasModeSpecificColor) && { value: ColorMode.ModeSpecific, label: "Do efeito" },
        has(ModeFlag.HasRandomColor) && { value: ColorMode.Random, label: "Aleatória" },
      ].filter(Boolean) as { value: number; label: string }[]
    : [];

  const directions = DIRECTIONS.filter((d) => has(d.flag));

  const setSlot = (i: number) => {
    if (!mode) return;
    const colors = mode.colors.slice();
    colors[i] = pickerColor;
    onModeChange({ ...mode, colors, colorMode: ColorMode.ModeSpecific });
  };

  const resizeSlots = (delta: number) => {
    if (!mode) return;
    const colors = mode.colors.slice();
    if (delta > 0) colors.push(pickerColor);
    else colors.pop();
    onModeChange({ ...mode, colors });
  };

  return (
    <section className="card" aria-labelledby="effect-title">
      <header className="card-head">
        <h2 id="effect-title">Efeito</h2>
        {has(ModeFlag.ManualSave) && (
          <button className="btn subtle small" onClick={onSave} title="Grava o modo na memória do dispositivo">
            <Save size={14} aria-hidden /> Salvar no dispositivo
          </button>
        )}
      </header>

      <div className="mode-grid" role="radiogroup" aria-label="Modo de iluminação">
        {device.modes.map((m, i) => (
          <button
            key={`${i}-${m.name}`}
            role="radio"
            aria-checked={i === device.activeMode}
            className={`mode-chip ${i === device.activeMode ? "active" : ""}`}
            onClick={() => i !== device.activeMode && onSelectMode(i)}
            title={m.name}
          >
            {modeLabel(m.name)}
          </button>
        ))}
      </div>

      {mode && (
        <div className="mode-params">
          {has(ModeFlag.HasSpeed) && (
            <Range
              label="Velocidade"
              min={mode.speedMin}
              max={mode.speedMax}
              value={mode.speed}
              onChange={(speed) => onModeChange({ ...mode, speed })}
            />
          )}
          {has(ModeFlag.HasBrightness) && (
            <Range
              label="Brilho"
              min={mode.brightnessMin}
              max={mode.brightnessMax}
              value={mode.brightness}
              onChange={(brightness) => onModeChange({ ...mode, brightness })}
            />
          )}

          {directions.length > 0 && (
            <div className="param">
              <span className="param-label">Direção</span>
              <div className="segmented" role="radiogroup" aria-label="Direção">
                {directions.map((d) => (
                  <button
                    key={d.value}
                    role="radio"
                    aria-checked={mode.direction === d.value}
                    className={mode.direction === d.value ? "active" : ""}
                    onClick={() => onModeChange({ ...mode, direction: d.value })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {colorModes.length > 1 && (
            <div className="param">
              <span className="param-label">Origem da cor</span>
              <div className="segmented" role="radiogroup" aria-label="Origem da cor">
                {colorModes.map((c) => (
                  <button
                    key={c.value}
                    role="radio"
                    aria-checked={mode.colorMode === c.value}
                    className={mode.colorMode === c.value ? "active" : ""}
                    onClick={() => onModeChange({ ...mode, colorMode: c.value })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {has(ModeFlag.HasModeSpecificColor) && mode.colorMode === ColorMode.ModeSpecific && (
            <div className="param">
              <span className="param-label">Cores do efeito</span>
              <div className="slot-row">
                {mode.colors.map((c, i) => (
                  <button
                    key={i}
                    className="swatch"
                    style={{ background: colorToHex(c) }}
                    onClick={() => setSlot(i)}
                    title="Clique para usar a cor selecionada"
                    aria-label={`Cor ${i + 1} do efeito: ${colorToHex(c)}. Clique para trocar pela cor selecionada`}
                  />
                ))}
                {mode.colorsMax > mode.colors.length && (
                  <button className="icon-btn" onClick={() => resizeSlots(1)} aria-label="Adicionar cor">
                    <Plus size={16} />
                  </button>
                )}
                {mode.colors.length > Math.max(mode.colorsMin, 1) && (
                  <button className="icon-btn" onClick={() => resizeSlots(-1)} aria-label="Remover última cor">
                    <Minus size={16} />
                  </button>
                )}
              </div>
              <p className="hint">Clique numa amostra para trocá-la pela cor do seletor.</p>
            </div>
          )}

          {!has(ModeFlag.HasSpeed) &&
            !has(ModeFlag.HasBrightness) &&
            directions.length === 0 &&
            colorModes.length <= 1 &&
            !has(ModeFlag.HasModeSpecificColor) && <p className="muted small">Este modo não tem ajustes.</p>}
        </div>
      )}
    </section>
  );
}
