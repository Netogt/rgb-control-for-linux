#!/usr/bin/env bash
# Instala o OpenRGB modificado (XPG Spectrix S20G + Pichau Aurum) e o
# RGB Control no CachyOS/Arch. Pode ser rodado de novo para atualizar.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENRGB_URL="https://gitlab.com/CalcProgrammer1/OpenRGB.git"
OPENRGB_COMMIT="bbc77470a7cba56af60989e54ba910d5ac66a3ac"
OPENRGB_DIR="$RAIZ/OpenRGB"
PATCH="$RAIZ/openrgb-patch/xpg-s20g-pichau-aurum.patch"
BIN_DIR="$HOME/.local/bin"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"

etapa() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
falha() { printf '\033[1;31mErro:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || falha "rode como usuário comum; o script pede sudo quando precisa."
command -v pacman >/dev/null || falha "este script é para CachyOS/Arch (pacman)."

etapa "Instalando dependências"
sudo pacman -S --needed \
    base-devel git pkgconf \
    qt6-base qt6-tools libusb hidapi mbedtls3 \
    webkit2gtk-4.1 librsvg openssl nodejs npm

if ! command -v cargo >/dev/null; then
    etapa "Instalando Rust"
    sudo pacman -S --needed rustup
    rustup default stable
fi

etapa "Baixando o OpenRGB"
if [[ ! -d "$OPENRGB_DIR/.git" ]]; then
    git clone "$OPENRGB_URL" "$OPENRGB_DIR"
fi
cd "$OPENRGB_DIR"
if git apply --reverse --check "$PATCH" 2>/dev/null; then
    echo "As modificações já estão aplicadas."
else
    git fetch --quiet origin
    git checkout --quiet "$OPENRGB_COMMIT"
    git apply "$PATCH"
fi
git submodule update --init --recursive

etapa "Compilando o OpenRGB"
qmake6 OpenRGB.pro
# Rodar o qmake muda a data da build e invalida os cabeçalhos pré-compilados.
rm -rf openrgb.gch
make -j"$(nproc)"
sudo install -m755 openrgb /usr/local/bin/openrgb
if systemctl is-active --quiet openrgb-server.service; then
    sudo systemctl restart openrgb-server.service
fi

etapa "Compilando o RGB Control"
cd "$RAIZ/rgb-control"
npm ci
npm run tauri build -- --no-bundle

etapa "Instalando o RGB Control"
install -Dm755 src-tauri/target/release/rgb-control "$BIN_DIR/rgb-control"
install -Dm644 src-tauri/icons/128x128.png "$DATA_DIR/icons/hicolor/128x128/apps/rgb-control.png"
install -d "$DATA_DIR/applications"
cat > "$DATA_DIR/applications/rgb-control.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=RGB Control
Comment=Cores dos dispositivos RGB (OpenRGB)
Exec="$BIN_DIR/rgb-control"
Icon=rgb-control
Terminal=false
Categories=Utility;
EOF

etapa "Pronto"
cat <<EOF
O RGB Control está no menu de aplicativos (ou rode: $BIN_DIR/rgb-control).

Na primeira vez, no app:
  1. Configurações → Como o servidor roda → "Junto com o app" (pede a senha uma vez).
  2. Fitas ARGB da placa-mãe: ajuste o número de LEDs no painel "Área".
  3. Escolha as cores e, em Cena inicial, clique em "Salvar estado atual"
     e ative "Reaplicar ao iniciar a sessão".
EOF
