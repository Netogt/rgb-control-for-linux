import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Check, Plus, X } from "lucide-react";
import { hexToColor, normalizeHex, readableOn } from "../color";

type Props = {
  color: string;
  onChange: (hex: string) => void;
  /** Fim de uma interação (soltar o seletor, escolher amostra, digitar). */
  onCommit: (hex: string) => void;
  livePreview: boolean;
  onApply: () => void;
  applying: boolean;
  applyLabel: string;
  favorites: string[];
  recent: string[];
  onFavoritesChange: (favorites: string[]) => void;
};

export function ColorPanel(props: Props) {
  const { color, onChange, onCommit, livePreview, onApply, applying, applyLabel, favorites, recent } = props;
  const [hexDraft, setHexDraft] = useState(color);
  const rgb = hexToColor(color) ?? { r: 0, g: 0, b: 0 };

  useEffect(() => setHexDraft(color), [color]);

  const commitHex = () => {
    const c = hexToColor(hexDraft);
    if (c) {
      const hex = normalizeHex(hexDraft);
      onChange(hex);
      onCommit(hex);
    } else {
      setHexDraft(color);
    }
  };

  const setChannel = (key: "r" | "g" | "b", raw: string) => {
    const v = Math.max(0, Math.min(255, Number(raw) || 0));
    const next = { ...rgb, [key]: v };
    const hex = "#" + [next.r, next.g, next.b].map((n) => n.toString(16).padStart(2, "0")).join("");
    onChange(hex);
    onCommit(hex);
  };

  const pick = (hex: string) => {
    onChange(hex);
    onCommit(hex);
  };

  const isFavorite = favorites.includes(color);

  return (
    <section className="card color-card" aria-labelledby="color-title">
      <header className="card-head">
        <h2 id="color-title">Cor</h2>
        <div className="color-preview" style={{ background: color, color: readableOn(color) }}>
          {color.toUpperCase()}
        </div>
      </header>

      <div
        className="picker-wrap"
        onPointerUp={() => onCommit(color)}
        onKeyUp={() => onCommit(color)}
      >
        <HexColorPicker color={color} onChange={onChange} />
      </div>

      <div className="color-inputs">
        <label className="field hex-field">
          <span>HEX</span>
          <input
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => e.key === "Enter" && commitHex()}
            spellCheck={false}
            maxLength={7}
            aria-invalid={!hexToColor(hexDraft)}
          />
        </label>
        {(["r", "g", "b"] as const).map((k) => (
          <label className="field rgb-field" key={k}>
            <span>{k.toUpperCase()}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={rgb[k]}
              onChange={(e) => setChannel(k, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="swatch-group">
        <div className="swatch-head">
          <span>Favoritas</span>
          <button
            className="text-btn"
            onClick={() =>
              props.onFavoritesChange(isFavorite ? favorites.filter((f) => f !== color) : [...favorites, color])
            }
          >
            {isFavorite ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
            {isFavorite ? "Remover atual" : "Salvar atual"}
          </button>
        </div>
        <div className="swatches" role="listbox" aria-label="Cores favoritas">
          {favorites.map((hex) => (
            <button
              key={hex}
              role="option"
              aria-selected={hex === color}
              className="swatch"
              style={{ background: hex }}
              onClick={() => pick(hex)}
              title={hex.toUpperCase()}
              aria-label={`Usar ${hex.toUpperCase()}`}
            >
              {hex === color && <Check size={14} color={readableOn(hex)} aria-hidden />}
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="swatch-group">
          <div className="swatch-head">
            <span>Recentes</span>
          </div>
          <div className="swatches small" aria-label="Cores recentes">
            {recent.map((hex) => (
              <button
                key={hex}
                className="swatch"
                style={{ background: hex }}
                onClick={() => pick(hex)}
                title={hex.toUpperCase()}
                aria-label={`Usar ${hex.toUpperCase()}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="apply-row">
        <button className="btn primary block" onClick={onApply} disabled={applying}>
          {applying ? "Aplicando…" : applyLabel}
        </button>
        <p className="hint">
          {livePreview
            ? "Prévia ao vivo ativa: a cor é enviada enquanto você arrasta."
            : "Prévia ao vivo desativada: a cor só é enviada ao clicar em aplicar."}
        </p>
      </div>
    </section>
  );
}
