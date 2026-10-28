import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import type { Toast } from "../hooks";

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="region" aria-label="Notificações" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            <Icon size={18} aria-hidden />
            <span>{t.text}</span>
            <button className="icon-btn ghost" onClick={() => onDismiss(t.id)} aria-label="Fechar notificação">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
