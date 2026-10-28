# Controlar o RGB do SSD XPG Spectrix S20G no Linux (OpenRGB)

Guia do que foi descoberto e feito para mudar a cor do SSD **XPG Spectrix S20G** no **CachyOS/Arch**, usando uma versão compilada do **OpenRGB** com um detector para o S20G.

## Hardware e software usados

| Item | Detalhe |
|---|---|
| SSD | XPG Spectrix S20G 3D NAND, 500 GB (`ASPECTRIXS20G-500G-C`), NVMe, firmware `VC3S500S` |
| Placa-mãe | ASUS TUF Gaming A520M-Plus WiFi |
| Sistema | CachyOS (Arch), também testado no Windows |
| Outros dispositivos RGB | LEDs traseiros da placa, pinos ARGB, mouse Redragon M711 Cobra |
| OpenRGB | `master` compilado a partir do código, com o detector do S20G adicionado |

## Resumo

- O OpenRGB oficial (build 1.1, commit `8e16de2`) **não lista o S20G** como dispositivo suportado.
- O S20G usa o **mesmo protocolo do S40G**: um controlador **ENE** (endereço `0x67`) acessado através de comandos pelo **NVMe**. Não é SMBus da placa-mãe nem cabo ARGB.
- Existe um merge request antigo no OpenRGB, "Add XPG Spectrix S20G to detectors for S40G" (!2379), que adiciona um detector para o S20G. Não consegui confirmar se foi aceito; na build testada ele **não** estava incluído.
- Solução que funcionou: compilar o OpenRGB com um detector que aceita o modelo `XPG SPECTRIX S20G` e rodar com `sudo`.

## Comportamento observado do SSD

- O SSD **não segue a placa-mãe**: as cores são diferentes das dos LEDs da placa e dos pinos ARGB, e ele **continua aceso** mesmo com o Aura desligado na BIOS.
- O Aura Sync (Windows) o enxerga e controla como um dispositivo `M2_SSD`.
- O **XPG Prime não reconhece** esse modelo.
- A cor **persiste enquanto o SSD tem energia** (por exemplo, ao reiniciar sem desligar). Ao **tirar da tomada**, ele volta ao arco-íris padrão. Por isso a cor precisa ser reaplicada a cada boot.
- Não há cabo saindo do SSD: o controle é pelo próprio slot M.2/NVMe.

## O que **não** era o caminho (para não repetir)

- **Engenharia reversa com API Monitor / captura de comandos NVMe:** desnecessária, já que o protocolo do S40G é reaproveitado.
- **SMBus / I2C da placa-mãe:** investiguei com o OpenRGB (via PawnIO no Windows). O log mostrou os barramentos `PIIX4 0`, `PIIX4 1` e `NCT6798`, mas o SSD não estava neles. O `Aac3572MbHal_x86.exe` do Aura usa SMBus para a placa, mas isso não se aplica ao SSD.
- **XPG Prime e Wine:** o Prime não reconhece o S20G e não há versão para Linux.
- **Compilar no Windows com Qt Creator (kit MinGW):** não foi concluído; o Linux foi mais simples.

## Passo a passo no Linux

### 1. Conferir o nome do SSD

O detector compara o modelo lido do NVMe com `XPG SPECTRIX S20G`:

```bash
cat /sys/class/nvme/nvme*/model
sudo nvme list
```

### 2. Instalar dependências

```bash
sudo pacman -S --needed base-devel git qt5-base qt5-tools libusb hidapi mbedtls pkgconf
```

Se o `qmake` pedir Qt 6, instale `qt6-base qt6-tools` e use `qmake6`.

### 3. Baixar o código (branch `master`)

```bash
git clone https://gitlab.com/CalcProgrammer1/OpenRGB.git
cd OpenRGB
git submodule update --init --recursive
```

> **Por que `master` e não a branch `xpg_s20g`?** A branch antiga (de 2024) falhou na etapa final de ligação com `mbedtls_ssl_conf_rng` não definida, porque o CachyOS usa o **mbedtls 4.2.0** e o pacote `mbedtls2` não existe nos repositórios. O `master` atual já é compatível, mas tem uma API de detectores diferente, então o commit do S20G (`af2355f4`) dava conflito no `cherry-pick`. Por isso o arquivo abaixo foi reescrito à mão.

### 4. Substituir o detector do Linux

Edite `Controllers/ENESMBusController/XPGSpectrixS40GDetect_Linux.cpp` e troque o conteúdo por:

```cpp
/*---------------------------------------------------------*\
| XPGSpectrixS40GDetect_Linux.cpp                           |
|                                                           |
|   Detector for XPG Spectrix S40G and S20G (Linux)         |
|                                                           |
|   This file is part of the OpenRGB project                |
|   SPDX-License-Identifier: GPL-2.0-or-later               |
\*---------------------------------------------------------*/

#include <dirent.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <vector>
#include "DetectionManager.h"
#include "ENESMBusController.h"
#include "ENESMBusInterface_SpectrixS40G_Linux.h"
#include "LogManager.h"
#include "RGBController.h"
#include "RGBController_ENESMBus.h"

static DetectedControllers DetectSpectrixControllers(const char* model, const char* name)
{
    DetectedControllers detected_controllers;

    /*-----------------------------------------------------*\
    | Search for /dev/nvmeX nodes with the given model      |
    \*-----------------------------------------------------*/
    unsigned int        nvme_idx = 0;

    while(1)
    {
        char nvme_dev_buf[1024];

        snprintf(nvme_dev_buf, 1024, "/sys/class/nvme/nvme%d/model", nvme_idx);

        int nvme_model_fd = open(nvme_dev_buf, O_RDONLY|O_NONBLOCK);

        if(nvme_model_fd < 0)
        {
            break;
        }

        memset(nvme_dev_buf, 0, 1024);

        if(read(nvme_model_fd, nvme_dev_buf, 1023) < 0)
        {
            LOG_WARNING("[%s] Probing %d, failed to read NVMe model", name, nvme_idx);
        }
        else
        {
            LOG_DEBUG("[%s] Probing %d, model: %s", name, nvme_idx, nvme_dev_buf);
        }

        close(nvme_model_fd);

        /*-------------------------------------------------*\
        | Check if this NVMe device matches the model       |
        \*-------------------------------------------------*/
        if(strncmp(nvme_dev_buf, model, strlen(model)) == 0)
        {
            snprintf(nvme_dev_buf, 1024, "/dev/nvme%d", nvme_idx);

            int nvme_fd = open(nvme_dev_buf, O_RDWR);

            if(nvme_fd > 0)
            {
                ENESMBusInterface_SpectrixS40G* interface      = new ENESMBusInterface_SpectrixS40G(nvme_fd, nvme_dev_buf);
                ENESMBusController*             controller     = new ENESMBusController(interface, 0x67, name, DEVICE_TYPE_STORAGE);
                RGBController_ENESMBus*         rgb_controller = new RGBController_ENESMBus(controller);

                detected_controllers.push_back(rgb_controller);
            }
        }

        nvme_idx++;
    }

    return(detected_controllers);
}

DetectedControllers DetectSpectrixS20GControllers()
{
    return(DetectSpectrixControllers("XPG SPECTRIX S20G", "XPG Spectrix S20G"));
}

DetectedControllers DetectSpectrixS40GControllers()
{
    return(DetectSpectrixControllers("XPG SPECTRIX S40G", "XPG Spectrix S40G"));
}

REGISTER_DETECTOR("XPG Spectrix S20G", DetectSpectrixS20GControllers);
REGISTER_DETECTOR("XPG Spectrix S40G", DetectSpectrixS40GControllers);
```

> **Cuidado ao criar o arquivo por `cat << 'EOF'`:** da primeira vez a palavra `EOF` foi parar dentro do `.cpp` e quebrou a compilação (`expected unqualified-id before '-' token`). Se acontecer, rode `sed -i '/^EOF$/d' Controllers/ENESMBusController/XPGSpectrixS40GDetect_Linux.cpp`. Abrir o arquivo num editor de texto evita o problema.

O protocolo, o endereço `0x67` e o resto da lógica continuam idênticos aos do S40G; só o nome do modelo e o registro do detector mudaram.

### 5. Compilar

```bash
qmake OpenRGB.pro      # ou qmake6
make -j$(nproc)
```

Os avisos do `CorsairWirelessController` são inofensivos.

### 6. Testar

```bash
sudo ./openrgb --list-devices
```

Saída obtida:

```
0: ASUS TUF GAMING A520M-PLUS WIFI
1: Redragon M711 Cobra
2: XPG Spectrix S20G
```

Atenção ao **número do dispositivo**: o `0` é a placa-mãe e o SSD era o `2`. Para colorir só o SSD:

```bash
sudo ./openrgb --device 2 --mode static --color FF0000
```

**Resultado: o SSD mudou de cor.** O aviso de udev ("udev rules are not installed") só significa que, sem as regras, dispositivos USB exigem root; não atrapalha rodando com `sudo`.

## Aplicar a cor em todo boot (systemd)

O SSD volta ao arco-íris quando é desligado da tomada, então o comando precisa rodar na inicialização. **Esta etapa foi apenas proposta e ainda não foi testada.**

```bash
sudo install -m755 ~/Projetos/rgb/OpenRGB/openrgb /usr/local/bin/openrgb

sudo tee /etc/systemd/system/openrgb-cor.service > /dev/null << 'EOF'
[Unit]
Description=Aplicar cor RGB no boot
After=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=QT_QPA_PLATFORM=offscreen
ExecStartPre=/bin/sleep 5
ExecStart=/usr/local/bin/openrgb --mode static --color FF0000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now openrgb-cor.service
systemctl status openrgb-cor.service
```

- Sem `--device`, a cor é aplicada a **todos** os dispositivos detectados (placa, mouse e SSD), o que evita depender do número do dispositivo.
- A cor é um valor hexadecimal `RRGGBB`. Para mudar, edite o serviço e rode `sudo systemctl restart openrgb-cor.service`.
- Se algum dispositivo não aceitar o modo `static`, o OpenRGB avisa e segue com os outros. Se a faixa ARGB não acender, normalmente é o tamanho da zona, que se ajusta na interface gráfica.
- Depois de suspender e voltar, as cores podem se perder; nesse caso dá para criar um serviço que roda ao retomar da suspensão.
- Até o Linux terminar de iniciar, o SSD ainda mostra o arco-íris. Isso é esperado.

## Observações e cuidados

- **Dual boot com Windows:** lá o Aura Sync volta a controlar o SSD (como `M2_SSD`) e a cor padrão reaparece.
- **Conflito de acesso:** no Windows, o Aura segura o barramento SMBus (mutex `Global\Access_SMBUS.HTP.Method`). Feche o Aura, o Armoury Crate e o XPG Prime antes de testar o OpenRGB lá.
- **Segurança:** o detector manda comandos pelo NVMe. Use só o código do projeto OpenRGB (como acima) e evite escrever comandos NVMe de fabricante à mão. Faça backup dos dados importantes antes de testar.
- **Contribuir com o projeto:** vale comentar no merge request !2379 (ou abrir uma issue) dizendo que o detector funciona no `ASPECTRIXS20G-500G-C`, firmware `VC3S500S`, para ajudar a incluir o S20G oficialmente.

## Linha do tempo resumida

1. OpenRGB não via o SSD; o XPG Prime também não.
2. O Aura Sync controla o SSD como `M2_SSD` (visto no `LastScript.xml`).
3. Análise do `Aac3572MbHal_x86.exe` mostrou SMBus para a placa; o OpenRGB com PawnIO listou os barramentos, mas o SSD não estava neles.
4. Descoberta: o OpenRGB tem detector do **S40G** (ENE via NVMe) e existia um MR para o **S20G**.
5. O Windows lê o disco como `XPG SPECTRIX S20G` (`...Prod_XPG_SPECTRIX_S20...`), compatível com o detector.
6. Compilação no Linux: a branch antiga falhou no link por causa do **mbedtls 4**; foi usado o `master` com o detector reescrito.
7. `openrgb --list-devices` mostrou `XPG Spectrix S20G` e a cor mudou com `--device 2 --mode static --color FF0000`.
