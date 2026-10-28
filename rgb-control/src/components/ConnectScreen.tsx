import { LoaderCircle, Plug, Power, Settings } from "lucide-react";

type Props = {
  connecting: boolean;
  error: string | null;
  host: string;
  port: number;
  serverPath: string;
  canStartServer: boolean;
  startingServer: boolean;
  onConnect: () => void;
  onStartServer: () => void;
  onOpenSettings: () => void;
};

export function ConnectScreen(p: Props) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-icon" aria-hidden>
          {p.connecting || p.startingServer ? <LoaderCircle size={28} className="spin" /> : <Plug size={28} />}
        </div>
        <h1>{p.startingServer ? "Iniciando o servidor OpenRGB…" : "Conecte ao servidor OpenRGB"}</h1>
        <p className="muted">
          O app conversa com o OpenRGB pelo SDK em{" "}
          <code>
            {p.host}:{p.port}
          </code>
          . O servidor precisa rodar como root para acessar o SSD pelo NVMe.
        </p>

        {p.error && !p.startingServer && (
          <p className="error-box" role="alert">
            {p.error}
          </p>
        )}

        <div className="row gap-s center wrap">
          <button className="btn primary" onClick={p.onStartServer} disabled={!p.canStartServer || p.startingServer}>
            <Power size={16} aria-hidden /> Iniciar servidor
          </button>
          <button className="btn" onClick={p.onConnect} disabled={p.connecting}>
            {p.connecting ? "Conectando…" : "Tentar novamente"}
          </button>
          <button className="btn subtle" onClick={p.onOpenSettings}>
            <Settings size={16} aria-hidden /> Configurações
          </button>
        </div>

        {!p.canStartServer && (
          <p className="hint">
            Não encontrei o executável do OpenRGB compilado. Indique o caminho em Configurações.
          </p>
        )}

        <details className="details">
          <summary>Prefiro iniciar pelo terminal</summary>
          <pre>
            <code>sudo {p.serverPath || "/caminho/para/openrgb"} --server --server-host 127.0.0.1</code>
          </pre>
          <p className="hint">
            Para não precisar disso, escolha "Junto com o app" em Configurações › Servidor OpenRGB: o servidor passa a
            abrir e fechar com o app, sem senha. Esta tela tenta conectar sozinha a cada poucos segundos.
          </p>
        </details>
      </div>
    </div>
  );
}
