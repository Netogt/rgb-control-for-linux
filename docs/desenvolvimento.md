# Desenvolvimento

Como modificar o app e o OpenRGB. Rode o [`instalar.sh`](../instalar.sh) uma vez antes, para ter as dependências e o OpenRGB compilado.

## App

```sh
cd rgb-control
npm install
npm run tauri dev
```

O que acontece no modo de desenvolvimento:
- o Vite serve a interface em `localhost:1420`. Alterações em `.tsx` e `.css` aparecem na hora, sem reiniciar;
- alterações no Rust (`src-tauri/src/`) fazem o Cargo recompilar e reabrir o app.

O executável de desenvolvimento (`src-tauri/target/debug/rgb-control`) depende do Vite para mostrar a janela. Por isso, não ative o autostart por ele.

### Verificações

```sh
npx tsc -b                          # tipos do TypeScript
cd src-tauri && cargo test          # testes do Rust
cargo test live_server -- --ignored --nocapture   # lista os dispositivos e modos do servidor em execução
```

O teste `live_server` conecta no servidor rodando e mostra, para cada dispositivo e modo, as flags, o brilho, a velocidade e as cores. É útil para entender o que um dispositivo suporta.

### Versão final

```sh
npm run tauri build -- --no-bundle   # binário em src-tauri/target/release/rgb-control
npm run tauri build -- --bundles deb # ou rpm / appimage, em src-tauri/target/release/bundle/
```

Na versão final, a interface (`dist/`) fica embutida no executável, que roda sozinho. Para instalar a versão nova, rode `./instalar.sh` ou copie o binário para `~/.local/bin/`.

## OpenRGB

### Compilar depois de alterar

```sh
cd OpenRGB
qmake6 OpenRGB.pro       # necessário ao criar uma pasta nova em Controllers/
rm -rf openrgb.gch       # o qmake invalida os cabeçalhos pré-compilados
make -j"$(nproc)"
sudo install -m755 openrgb /usr/local/bin/openrgb
sudo systemctl restart openrgb-server     # se estiver rodando
```

Os controladores são encontrados por `Controllers/*/*.cpp`. Uma pasta nova só entra na compilação depois de rodar o `qmake6`.

### Atualizar o patch

Depois de alterar arquivos do OpenRGB, gere o patch de novo. Inclua os arquivos novos, além dos modificados:

```sh
cd OpenRGB
git add -N Controllers/PichauAurumController       # faz os arquivos novos aparecerem no diff
git diff -- Controllers/ENESMBusController/XPGSpectrixS40GDetect_Linux.cpp \
            Controllers/PichauAurumController \
    > ../openrgb-patch/xpg-s20g-pichau-aurum.patch
git reset -q -- Controllers/PichauAurumController
```

Se mexer em outros arquivos do OpenRGB, acrescente-os à lista do `git diff`.

### Atualizar para um OpenRGB mais novo

1. Dentro de `OpenRGB/`:
   ```sh
   git stash -u                 # guarda as modificações
   git fetch origin
   git checkout <novo-commit>
   git stash pop                # reaplica; resolva conflitos se houver
   ```
2. Compile e teste: `sudo ./openrgb --list-devices`, e depois o app.
3. Atualize o patch (seção anterior) e o `OPENRGB_COMMIT` no [`instalar.sh`](../instalar.sh).

O OpenRGB muda a API dos detectores de tempos em tempos. Se a compilação quebrar nos arquivos do patch, compare com outros detectores da mesma versão. Os de `Controllers/ENESMBusController/` são um bom exemplo.

## Licenças dos arquivos novos

| Onde | Licença | Cabeçalho |
|---|---|---|
| `rgb-control/`, scripts e docs | GPL-3.0-or-later | `license` no `package.json` e no `Cargo.toml` |
| `Controllers/PichauAurumController/` | GPL-3.0-only (protocolo do OpenAurum) | `SPDX-License-Identifier: GPL-3.0-only` |
| Outros arquivos do OpenRGB | GPL-2.0-or-later | o original do OpenRGB |
