# Solução de problemas

## O app não conecta ao servidor

1. **Veja se o serviço está rodando:**
   ```sh
   systemctl status openrgb-server
   journalctl -u openrgb-server -n 50
   ```
2. **Veja se outro OpenRGB está ocupando a porta 6742**, por exemplo um aberto pelo terminal:
   ```sh
   pgrep -a openrgb
   sudo pkill -x openrgb       # fecha todos; o app sobe o serviço de novo
   ```
3. **Teste o OpenRGB sozinho:** `sudo /usr/local/bin/openrgb --list-devices`. Se der erro aqui, o problema é na compilação do OpenRGB.

O aviso *"The OpenRGB udev rules are not installed"* é normal: o servidor roda como root e não precisa das regras do udev.

## Um dispositivo não aparece

- **Foi conectado com o servidor já rodando:** clique em **Procurar dispositivos novamente** (↻) na barra lateral.
- **O OpenRGB foi recompilado e o servidor antigo continua rodando:** reinicie o servidor com `sudo systemctl restart openrgb-server`, ou feche e abra o app no modo "Junto com o app".
- **Placa-mãe:** o OpenRGB precisa do módulo `i2c-dev`:
  ```sh
  sudo modprobe i2c-dev
  echo i2c-dev | sudo tee /etc/modules-load.d/i2c-dev.conf   # carrega em todo boot
  ```
- **SSD:** o modelo precisa começar com `XPG SPECTRIX S20G` ou `XPG SPECTRIX S40G`. Para conferir: `cat /sys/class/nvme/nvme*/model`.
- **Teclado:** o ID USB precisa ser `36ae:fe9c`. Para conferir: `lsusb | grep -i 36ae`.

## As fitas ARGB não acendem ou não mudam de cor

- **A zona está com 0 LEDs:** ajuste o tamanho no painel **Área**. Veja [Uso → Fitas ARGB](uso.md#fitas-argb-endereçáveis).
- **Funcionam pelo terminal, mas não com o servidor junto com o app:** o serviço foi instalado por uma versão antiga, sem `Environment=HOME=/root`. Por isso ele não acha os tamanhos salvos.
  1. Em Configurações, escolha **Manual** e depois **Junto com o app**, para reinstalar o serviço.
  2. Ajuste o tamanho das fitas mais uma vez.

  Para conferir se a correção está no serviço: `grep HOME /etc/systemd/system/openrgb-server.service`.
- **Ficam paradas na última cor:** o controlador da placa mantém a última cor enquanto não recebe outra. Se as fitas não mudam, a zona provavelmente está com 0 LEDs, ou o servidor não tem os tamanhos salvos (item acima).

## As cores não voltam no login

1. **Confira se o autostart existe:** `ls ~/.config/autostart/rgb-control-apply.desktop`.
2. **Confira se ele aponta para o executável certo:** `grep Exec ~/.config/autostart/rgb-control-apply.desktop`. Se aponta para `src-tauri/target/debug/…`, o app foi ativado pelo modo de desenvolvimento. Abra a versão instalada (`~/.local/bin/rgb-control`) e desative e ative **Reaplicar ao iniciar a sessão**.
3. **Rode o mesmo comando à mão** para ver as mensagens:
   ```sh
   ~/.local/bin/rgb-control --apply-saved
   ```
4. **Confira a cena:** ela é aplicada como foi salva da última vez. Mudou as cores depois? Clique em **Salvar estado atual** de novo.

## O teclado para de responder

Depois de trocar de efeito, a interface USB do teclado pode travar em alguns sistemas. Use o parâmetro de kernel `usbhid.quirks=0x36ae:0xfe9c:0x400`. Veja [Instalação → Teclado Pichau Aurum](instalacao.md#teclado-pichau-aurum).

## O brilho do teclado parece baixo

- **Confira o controle de Brilho** no painel **Efeito**: o máximo é 10.
- **Confira a cor:** com uma cor escolhida, o brilho real também depende da cor. Cores escuras (V baixo no HSV) ficam mais fracas mesmo com o brilho no máximo. Use cores "puras", como `#FF0000` ou `#7800FF`, para ter o brilho máximo.

## Erros na compilação

| Erro | Solução |
|---|---|
| `lrelease: comando não encontrado` (Error 127) | `sudo pacman -S qt6-tools` |
| `PCH file invalid` ou `fatal error: openrgb` | `rm -rf OpenRGB/openrgb.gch` e rodar o `make` de novo (o `instalar.sh` já faz isso) |
| `mbedtls_ssl_conf_rng` não definida | Falta o `mbedtls3`: `sudo pacman -S mbedtls3` |
| `npm ERR! enoent … package.json` | O `npm` foi rodado fora da pasta `rgb-control/` |
| O patch não aplica | O OpenRGB não está no commit `bbc7747`, ou já tem outras mudanças. Rode `git -C OpenRGB status`. |
