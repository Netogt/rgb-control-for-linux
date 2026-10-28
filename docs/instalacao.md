# Instalação

Guia para instalar o RGB Control e o OpenRGB modificado no **CachyOS** (ou outra distro baseada no Arch).

## Requisitos

- CachyOS ou Arch Linux, com `sudo`.
- systemd e polkit (já vêm no CachyOS). Sem eles, só o modo manual do servidor funciona.
- Conexão com a internet, para baixar pacotes e o código do OpenRGB.

## Instalação com o script

```sh
git clone https://github.com/Netogt/NOME_DO_REPOSITORIO.git ~/Projetos/rgb
cd ~/Projetos/rgb
./instalar.sh
```

Rode como usuário comum: o script pede a senha do `sudo` quando precisa. A primeira compilação leva alguns minutos.

### O que o script faz

1. **Dependências** via `pacman`:

   | Para | Pacotes |
   |---|---|
   | Compilar | `base-devel git pkgconf` |
   | OpenRGB | `qt6-base qt6-tools libusb hidapi mbedtls3` |
   | App | `webkit2gtk-4.1 librsvg openssl nodejs npm` |
   | Rust | `rustup`, só se o `cargo` não estiver instalado |

2. **OpenRGB:**
   - clona o código em `OpenRGB/`, na pasta do repositório;
   - volta para o commit `bbc7747`;
   - aplica [`openrgb-patch/xpg-s20g-pichau-aurum.patch`](../openrgb-patch/xpg-s20g-pichau-aurum.patch).
3. **Compila o OpenRGB** com `qmake6` e `make` e o instala em `/usr/local/bin/openrgb`. Se o serviço `openrgb-server` estiver rodando, ele é reiniciado para usar o binário novo.
4. **Compila o app** com `npm ci` e `npm run tauri build -- --no-bundle` e instala:
   - `~/.local/bin/rgb-control`;
   - o atalho `~/.local/share/applications/rgb-control.desktop`;
   - o ícone `~/.local/share/icons/hicolor/128x128/apps/rgb-control.png`.

## Primeira configuração

Abra o **RGB Control** pelo menu de aplicativos e faça uma vez:

1. **Servidor:** em **Configurações → Servidor OpenRGB → Como o servidor roda**, escolha **"Junto com o app"**. O sistema pede sua senha uma vez para instalar o serviço. Depois disso, o servidor abre e fecha junto com o app, sem senha.
2. **Fitas ARGB da placa-mãe:** os pinos ARGB aparecem com 0 LEDs. Selecione a placa-mãe e, no painel **Área**, informe o número de LEDs de cada fita. Veja [Uso → Fitas ARGB](uso.md#fitas-argb-endereçáveis).
3. **Cores no boot:** escolha as cores e, em **Configurações → Cena inicial**:
   - clique em **Salvar estado atual**;
   - ative **Reaplicar ao iniciar a sessão**.

   Assim as cores voltam sozinhas a cada login, inclusive no SSD, que volta ao arco-íris quando o PC fica sem energia.

### Teclado Pichau Aurum

Se o teclado parar de responder depois de trocar de efeito, adicione `usbhid.quirks=0x36ae:0xfe9c:0x400` aos parâmetros do kernel e reinicie. Onde fica depende do carregador de boot:

| Carregador | Arquivo | Depois de editar |
|---|---|---|
| Limine (padrão atual do CachyOS) | `/etc/default/limine`, na linha `KERNEL_CMDLINE[default]+="…"` | `sudo limine-update` |
| systemd-boot | `/etc/sdboot-manage.conf`, em `LINUX_OPTIONS` | `sudo sdboot-manage gen` |
| GRUB | `/etc/default/grub`, em `GRUB_CMDLINE_LINUX_DEFAULT` | `sudo grub-mkconfig -o /boot/grub/grub.cfg` |

## Atualizar

Depois de um `git pull`, rode o script de novo:

```sh
cd ~/Projetos/rgb
git pull
./instalar.sh
```

Ele recompila só o que mudou e mantém as suas configurações.

## Desinstalar

1. **No app**, antes de remover os arquivos:
   - em **Configurações → Como o servidor roda**, escolha **"Manual"**. Isso remove o serviço e a regra do polkit;
   - desative **Reaplicar ao iniciar a sessão**.
2. **No terminal:**
   ```sh
   # App
   rm -f ~/.local/bin/rgb-control \
         ~/.local/share/applications/rgb-control.desktop \
         ~/.local/share/icons/hicolor/128x128/apps/rgb-control.png
   rm -rf ~/.config/dev.luizneto.rgbcontrol        # configurações, cores e cena

   # OpenRGB
   sudo rm -f /usr/local/bin/openrgb
   sudo rm -rf /root/.config/OpenRGB               # tamanhos das fitas e configuração do servidor
   ```
3. **Se não fez o passo 1**, remova o serviço, a regra e o autostart manualmente:
   ```sh
   sudo systemctl disable --now openrgb-server.service
   sudo rm -f /etc/systemd/system/openrgb-server.service /etc/polkit-1/rules.d/50-rgb-control.rules
   sudo systemctl daemon-reload
   rm -f ~/.config/autostart/rgb-control-apply.desktop
   ```

### Tudo o que o projeto cria no sistema

| Caminho | Criado por | Conteúdo |
|---|---|---|
| `/usr/local/bin/openrgb` | script e app | OpenRGB modificado |
| `/etc/systemd/system/openrgb-server.service` | app | Serviço do servidor |
| `/etc/polkit-1/rules.d/50-rgb-control.rules` | app | Permite ao seu usuário ligar e desligar o serviço sem senha |
| `/root/.config/OpenRGB/` | OpenRGB | Configuração do servidor, incluindo os tamanhos das fitas ARGB |
| `~/.local/bin/rgb-control` | script | O app |
| `~/.local/share/applications/rgb-control.desktop` | script | Atalho no menu |
| `~/.config/dev.luizneto.rgbcontrol/config.json` | app | Configurações, favoritas, recentes e cena inicial |
| `~/.config/autostart/rgb-control-apply.desktop` | app | Reaplica a cena no login |

## Instalação manual

Se preferir não usar o script:

```sh
sudo pacman -S --needed base-devel git pkgconf qt6-base qt6-tools libusb hidapi mbedtls3 \
    webkit2gtk-4.1 librsvg openssl nodejs npm rustup
rustup default stable

# OpenRGB
git clone https://gitlab.com/CalcProgrammer1/OpenRGB.git ~/Projetos/rgb/OpenRGB
cd ~/Projetos/rgb/OpenRGB
git checkout bbc77470a7cba56af60989e54ba910d5ac66a3ac
git apply ../openrgb-patch/xpg-s20g-pichau-aurum.patch
git submodule update --init --recursive
qmake6 OpenRGB.pro && rm -rf openrgb.gch && make -j"$(nproc)"
sudo install -m755 openrgb /usr/local/bin/openrgb

# App
cd ~/Projetos/rgb/rgb-control
npm ci
npm run tauri build -- --no-bundle
install -Dm755 src-tauri/target/release/rgb-control ~/.local/bin/rgb-control
```

Para testar o OpenRGB sozinho: `sudo /usr/local/bin/openrgb --list-devices`.
