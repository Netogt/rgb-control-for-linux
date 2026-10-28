//! Integração com o sistema: localizar o OpenRGB, iniciar o servidor com
//! privilégios (pkexec), serviço systemd e autostart da sessão.

use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const SERVICE_NAME: &str = "openrgb-server.service";
const SERVICE_PATH: &str = "/etc/systemd/system/openrgb-server.service";
const POLKIT_RULE_PATH: &str = "/etc/polkit-1/rules.d/50-rgb-control.rules";
const INSTALLED_BINARY: &str = "/usr/local/bin/openrgb";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub openrgb_candidates: Vec<String>,
    pub service_installed: bool,
    pub service_enabled: bool,
    pub service_active: bool,
    pub autostart: bool,
    pub pkexec: bool,
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

pub fn openrgb_candidates() -> Vec<String> {
    let mut paths = vec![
        PathBuf::from(INSTALLED_BINARY),
        home().join("Projetos/rgb/OpenRGB/openrgb"),
        home().join("Projetos/rgb/OpenRGB/build/openrgb"),
        PathBuf::from("/usr/bin/openrgb"),
    ];
    paths.dedup();
    paths
        .into_iter()
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

fn systemctl(args: &[&str]) -> bool {
    Command::new("systemctl")
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn autostart_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| home().join(".config"))
        .join("autostart/rgb-control-apply.desktop")
}

pub fn status() -> SystemStatus {
    SystemStatus {
        openrgb_candidates: openrgb_candidates(),
        service_installed: service_installed(),
        service_enabled: systemctl(&["is-enabled", "--quiet", SERVICE_NAME]),
        service_active: service_active(),
        autostart: autostart_path().exists(),
        pkexec: which("pkexec"),
    }
}

fn which(bin: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join(bin).is_file()))
        .unwrap_or(false)
}

fn validate_binary(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.is_absolute() || !p.is_file() {
        return Err(format!("o executável do OpenRGB não foi encontrado em \"{path}\""));
    }
    Ok(())
}

/// Inicia `openrgb --server` como root. O pkexec mostra a janela de senha
/// do sistema; o processo continua rodando depois que o app fecha.
pub fn start_server(path: &str, port: u16) -> Result<(), String> {
    validate_binary(path)?;
    Command::new("pkexec")
        .arg("env")
        .arg("QT_QPA_PLATFORM=offscreen")
        .arg("HOME=/root")
        .arg(path)
        .args(["--server", "--server-host", "127.0.0.1", "--server-port"])
        .arg(port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("não foi possível executar o pkexec: {e}"))?;
    Ok(())
}

fn run_as_root(script: &str) -> Result<(), String> {
    let mut child = Command::new("pkexec")
        .args(["sh", "-s"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("não foi possível executar o pkexec: {e}"))?;
    child
        .stdin
        .take()
        .expect("stdin configurado como pipe")
        .write_all(script.as_bytes())
        .map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    match output.status.code() {
        Some(0) => Ok(()),
        Some(126) | Some(127) => Err("autorização cancelada".into()),
        _ => Err(format!(
            "o comando falhou: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )),
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Aspas no formato da especificação de arquivos .desktop.
fn desktop_quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
    out
}

fn current_user() -> Result<String, String> {
    let user = std::env::var("USER").map_err(|_| "não foi possível descobrir o usuário atual".to_string())?;
    let valid = !user.is_empty()
        && user
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if valid {
        Ok(user)
    } else {
        Err(format!("nome de usuário inesperado: {user}"))
    }
}

/// Regra que libera start/stop/restart deste serviço para `user`, sem senha.
fn polkit_rule(user: &str) -> String {
    format!(
        "// Criado pelo RGB Control: permite ao usuário {user} iniciar e parar\n\
         // o servidor OpenRGB sem senha.\n\
         polkit.addRule(function(action, subject) {{\n\
         \x20   if (action.id == \"org.freedesktop.systemd1.manage-units\" &&\n\
         \x20       action.lookup(\"unit\") == \"{SERVICE_NAME}\" &&\n\
         \x20       subject.user == \"{user}\") {{\n\
         \x20       var verb = action.lookup(\"verb\");\n\
         \x20       if (verb == \"start\" || verb == \"stop\" || verb == \"restart\") {{\n\
         \x20           return polkit.Result.YES;\n\
         \x20       }}\n\
         \x20   }}\n\
         }});\n"
    )
}

/// Copia o binário para /usr/local/bin, cria o serviço e uma regra do
/// polkit que deixa o usuário atual iniciar e parar só esse serviço sem
/// senha. Com `at_boot`, o serviço fica ativo desde a inicialização; sem,
/// o app sobe o servidor ao abrir e para ao fechar. Qualquer `openrgb`
/// aberto é encerrado para liberar a porta.
pub fn install_service(path: &str, port: u16, at_boot: bool) -> Result<(), String> {
    validate_binary(path)?;
    let rule = polkit_rule(&current_user()?);
    let activate = if at_boot {
        format!("systemctl enable --now {SERVICE_NAME}\n")
    } else {
        format!("systemctl disable {SERVICE_NAME} 2>/dev/null || true\n")
    };
    let unit = format!(
        "[Unit]\n\
         Description=Servidor OpenRGB (RGB Control)\n\
         After=multi-user.target\n\
         \n\
         [Service]\n\
         Type=simple\n\
         Environment=QT_QPA_PLATFORM=offscreen\n\
         Environment=HOME=/root\n\
         ExecStart={INSTALLED_BINARY} --server --server-host 127.0.0.1 --server-port {port}\n\
         Restart=on-failure\n\
         RestartSec=3\n\
         \n\
         [Install]\n\
         WantedBy=multi-user.target\n"
    );
    let copy = if path == INSTALLED_BINARY {
        String::new()
    } else {
        format!("install -m755 {} {INSTALLED_BINARY}\n", shell_quote(path))
    };
    // Versões anteriores do serviço rodavam sem HOME, e o OpenRGB gravava a
    // configuração na raiz do sistema em vez de /root/.config/OpenRGB.
    let cleanup = "rm -f /OpenRGB.json /logs/OpenRGB_*.log\n\
                   rmdir /logs /profiles 2>/dev/null || true\n";
    let script = format!(
        "set -e\n\
         {copy}\
         cat > {SERVICE_PATH} <<'UNIT_EOF'\n{unit}UNIT_EOF\n\
         mkdir -p /etc/polkit-1/rules.d\n\
         cat > {POLKIT_RULE_PATH} <<'RULE_EOF'\n{rule}RULE_EOF\n\
         chmod 644 {POLKIT_RULE_PATH}\n\
         systemctl daemon-reload\n\
         systemctl stop {SERVICE_NAME} 2>/dev/null || true\n\
         pkill -x openrgb || true\n\
         sleep 1\n\
         {cleanup}\
         {activate}"
    );
    run_as_root(&script)
}

pub fn remove_service() -> Result<(), String> {
    let script = format!(
        "systemctl disable --now {SERVICE_NAME} || true\n\
         rm -f {SERVICE_PATH} {POLKIT_RULE_PATH}\n\
         systemctl daemon-reload\n"
    );
    run_as_root(&script)
}

pub fn service_installed() -> bool {
    Path::new(SERVICE_PATH).exists()
}

pub fn service_active() -> bool {
    systemctl(&["is-active", "--quiet", SERVICE_NAME])
}

/// Sobe o serviço sem senha (graças à regra do polkit). Devolve `true` se
/// o servidor estava parado e foi iniciado agora.
pub fn start_service() -> Result<bool, String> {
    if !service_installed() {
        return Err("o serviço do OpenRGB não está instalado".into());
    }
    if service_active() {
        return Ok(false);
    }
    let output = Command::new("systemctl")
        .args(["start", SERVICE_NAME])
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("não foi possível executar o systemctl: {e}"))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err(format!(
            "não foi possível iniciar o servidor: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

/// Para o serviço sem esperar o processo terminar, para não travar o
/// fechamento do app.
pub fn stop_service() {
    let _ = Command::new("systemctl")
        .args(["stop", "--no-block", SERVICE_NAME])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

pub fn set_autostart(enabled: bool) -> Result<(), String> {
    let path = autostart_path();
    if !enabled {
        return match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let entry = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=RGB Control (aplicar cores)\n\
         Comment=Reaplica a cena inicial salva no RGB Control\n\
         Exec={} --apply-saved\n\
         Terminal=false\n\
         NoDisplay=true\n\
         X-GNOME-Autostart-enabled=true\n",
        desktop_quote(&exe.to_string_lossy())
    );
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, entry).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polkit_rule_is_valid_js() {
        let rule = polkit_rule("usuario");
        println!("{rule}");
        assert!(rule.contains("subject.user == \"usuario\""));
        assert!(rule.contains("action.lookup(\"unit\") == \"openrgb-server.service\""));
        assert!(rule.contains("polkit.addRule(function(action, subject) {\n"));
        assert!(rule.ends_with("});\n"));
    }
}
