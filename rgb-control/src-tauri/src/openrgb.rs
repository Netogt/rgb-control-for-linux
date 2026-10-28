//! Cliente mínimo do SDK do OpenRGB (protocolo de rede, versão 4).
//!
//! O servidor atual (protocolo 6) continua aceitando clientes antigos e
//! negocia a menor versão entre os dois. A versão 4 é estável, não exige
//! ACKs e já descreve segmentos de zona.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

pub const CLIENT_PROTOCOL_VERSION: u32 = 4;

const MAGIC: &[u8; 4] = b"ORGB";

mod pkt {
    pub const REQUEST_CONTROLLER_COUNT: u32 = 0;
    pub const REQUEST_CONTROLLER_DATA: u32 = 1;
    pub const REQUEST_PROTOCOL_VERSION: u32 = 40;
    pub const SET_CLIENT_NAME: u32 = 50;
    pub const DEVICE_LIST_UPDATED: u32 = 100;
    pub const REQUEST_RESCAN_DEVICES: u32 = 140;
    pub const RESIZE_ZONE: u32 = 1000;
    pub const UPDATE_LEDS: u32 = 1050;
    pub const SET_CUSTOM_MODE: u32 = 1100;
    pub const UPDATE_MODE: u32 = 1101;
    pub const SAVE_MODE: u32 = 1102;
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("não foi possível conectar ao servidor OpenRGB em {0}: {1}")]
    Connect(String, std::io::Error),
    #[error("erro de comunicação com o servidor: {0}")]
    Io(#[from] std::io::Error),
    #[error("resposta inválida do servidor: {0}")]
    Protocol(String),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mode {
    pub name: String,
    pub value: i32,
    pub flags: u32,
    pub speed_min: u32,
    pub speed_max: u32,
    pub brightness_min: u32,
    pub brightness_max: u32,
    pub colors_min: u32,
    pub colors_max: u32,
    pub speed: u32,
    pub brightness: u32,
    pub direction: u32,
    pub color_mode: u32,
    pub colors: Vec<Color>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatrixMap {
    pub height: u32,
    pub width: u32,
    pub map: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub name: String,
    pub zone_type: u32,
    pub start_idx: u32,
    pub leds_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Zone {
    pub name: String,
    pub zone_type: u32,
    pub leds_min: u32,
    pub leds_max: u32,
    pub leds_count: u32,
    pub matrix: Option<MatrixMap>,
    pub segments: Vec<Segment>,
    /// Índice do primeiro LED desta zona no vetor de LEDs do dispositivo.
    pub start_idx: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub index: u32,
    pub device_type: u32,
    pub name: String,
    pub vendor: String,
    pub description: String,
    pub version: String,
    pub serial: String,
    pub location: String,
    pub active_mode: i32,
    pub modes: Vec<Mode>,
    pub zones: Vec<Zone>,
    pub leds: Vec<String>,
    pub colors: Vec<Color>,
}

pub struct Client {
    stream: TcpStream,
    pub protocol: u32,
    pub server_protocol: u32,
    /// O servidor avisou que a lista de dispositivos mudou.
    pub devices_changed: bool,
}

impl Client {
    pub fn connect(host: &str, port: u16, client_name: &str) -> Result<Self> {
        let addr_text = format!("{host}:{port}");
        let addr = addr_text
            .to_socket_addrs()
            .map_err(|e| Error::Connect(addr_text.clone(), e))?
            .next()
            .ok_or_else(|| {
                Error::Connect(
                    addr_text.clone(),
                    std::io::Error::new(std::io::ErrorKind::NotFound, "endereço inválido"),
                )
            })?;

        let stream = TcpStream::connect_timeout(&addr, Duration::from_secs(2))
            .map_err(|e| Error::Connect(addr_text.clone(), e))?;
        stream.set_nodelay(true)?;
        stream.set_read_timeout(Some(Duration::from_secs(10)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;

        let mut client = Client {
            stream,
            protocol: 0,
            server_protocol: 0,
            devices_changed: false,
        };

        let reply = client.request(
            0,
            pkt::REQUEST_PROTOCOL_VERSION,
            &CLIENT_PROTOCOL_VERSION.to_le_bytes(),
        )?;
        let server = Reader::new(&reply).u32()?;
        client.server_protocol = server;
        client.protocol = server.min(CLIENT_PROTOCOL_VERSION);

        let mut name = client_name.as_bytes().to_vec();
        name.push(0);
        client.send(0, pkt::SET_CLIENT_NAME, &name)?;

        Ok(client)
    }

    fn send(&mut self, dev_id: u32, pkt_id: u32, data: &[u8]) -> Result<()> {
        let mut buf = Vec::with_capacity(16 + data.len());
        buf.extend_from_slice(MAGIC);
        buf.extend_from_slice(&dev_id.to_le_bytes());
        buf.extend_from_slice(&pkt_id.to_le_bytes());
        buf.extend_from_slice(&(data.len() as u32).to_le_bytes());
        buf.extend_from_slice(data);
        self.stream.write_all(&buf)?;
        Ok(())
    }

    fn recv(&mut self) -> Result<(u32, u32, Vec<u8>)> {
        let mut header = [0u8; 16];
        self.stream.read_exact(&mut header)?;
        if &header[0..4] != MAGIC {
            return Err(Error::Protocol("cabeçalho sem 'ORGB'".into()));
        }
        let dev_id = u32::from_le_bytes(header[4..8].try_into().unwrap());
        let pkt_id = u32::from_le_bytes(header[8..12].try_into().unwrap());
        let size = u32::from_le_bytes(header[12..16].try_into().unwrap()) as usize;
        let mut data = vec![0u8; size];
        self.stream.read_exact(&mut data)?;
        Ok((dev_id, pkt_id, data))
    }

    /// Envia um pacote e espera a resposta com o mesmo ID, descartando
    /// notificações assíncronas que cheguem no meio do caminho.
    fn request(&mut self, dev_id: u32, pkt_id: u32, data: &[u8]) -> Result<Vec<u8>> {
        self.send(dev_id, pkt_id, data)?;
        loop {
            let (_, id, reply) = self.recv()?;
            if id == pkt_id {
                return Ok(reply);
            }
            if id == pkt::DEVICE_LIST_UPDATED {
                self.devices_changed = true;
            }
        }
    }

    /// Lê notificações pendentes sem bloquear (usado para detectar
    /// mudanças na lista de dispositivos e se a conexão caiu).
    pub fn poll(&mut self) -> Result<()> {
        self.stream.set_nonblocking(true)?;
        let mut probe = [0u8; 1];
        let result = self.stream.peek(&mut probe);
        self.stream.set_nonblocking(false)?;
        match result {
            Ok(0) => Err(Error::Io(std::io::Error::new(
                std::io::ErrorKind::ConnectionAborted,
                "o servidor fechou a conexão",
            ))),
            Ok(_) => {
                let (_, id, _) = self.recv()?;
                if id == pkt::DEVICE_LIST_UPDATED {
                    self.devices_changed = true;
                }
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn controller_count(&mut self) -> Result<u32> {
        let reply = self.request(0, pkt::REQUEST_CONTROLLER_COUNT, &[])?;
        Reader::new(&reply).u32()
    }

    pub fn controller_data(&mut self, index: u32) -> Result<Device> {
        let reply = self.request(
            index,
            pkt::REQUEST_CONTROLLER_DATA,
            &self.protocol.to_le_bytes(),
        )?;
        parse_device(&reply, index, self.protocol)
    }

    pub fn devices(&mut self) -> Result<Vec<Device>> {
        self.devices_changed = false;
        let count = self.controller_count()?;
        (0..count).map(|i| self.controller_data(i)).collect()
    }

    pub fn rescan(&mut self) -> Result<()> {
        self.send(0, pkt::REQUEST_RESCAN_DEVICES, &[])
    }

    /// Define quantos LEDs uma zona endereçável tem (ex.: fita ARGB num
    /// header da placa-mãe). O servidor grava o valor na configuração dele.
    pub fn resize_zone(&mut self, index: u32, zone: i32, size: i32) -> Result<()> {
        let mut data = Vec::with_capacity(8);
        data.extend_from_slice(&zone.to_le_bytes());
        data.extend_from_slice(&size.to_le_bytes());
        self.send(index, pkt::RESIZE_ZONE, &data)
    }

    pub fn set_custom_mode(&mut self, index: u32) -> Result<()> {
        self.send(index, pkt::SET_CUSTOM_MODE, &[])
    }

    pub fn update_mode(&mut self, index: u32, mode_idx: i32, mode: &Mode, save: bool) -> Result<()> {
        let mut body = Vec::new();
        body.extend_from_slice(&mode_idx.to_le_bytes());
        write_mode(&mut body, mode, self.protocol);
        let id = if save { pkt::SAVE_MODE } else { pkt::UPDATE_MODE };
        self.send(index, id, &with_size_prefix(body))
    }

    pub fn update_leds(&mut self, index: u32, colors: &[Color]) -> Result<()> {
        let mut body = Vec::new();
        write_colors(&mut body, colors);
        self.send(index, pkt::UPDATE_LEDS, &with_size_prefix(body))
    }
}

/// Os pacotes de atualização começam com o tamanho total (incluindo o
/// próprio campo de tamanho).
fn with_size_prefix(body: Vec<u8>) -> Vec<u8> {
    let total = (body.len() + 4) as u32;
    let mut out = Vec::with_capacity(total as usize);
    out.extend_from_slice(&total.to_le_bytes());
    out.extend(body);
    out
}

fn color_to_u32(c: &Color) -> u32 {
    c.r as u32 | (c.g as u32) << 8 | (c.b as u32) << 16
}

fn write_colors(out: &mut Vec<u8>, colors: &[Color]) {
    out.extend_from_slice(&(colors.len() as u16).to_le_bytes());
    for c in colors {
        out.extend_from_slice(&color_to_u32(c).to_le_bytes());
    }
}

fn write_string(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&((s.len() + 1) as u16).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
    out.push(0);
}

fn write_mode(out: &mut Vec<u8>, m: &Mode, protocol: u32) {
    write_string(out, &m.name);
    out.extend_from_slice(&m.value.to_le_bytes());
    out.extend_from_slice(&m.flags.to_le_bytes());
    out.extend_from_slice(&m.speed_min.to_le_bytes());
    out.extend_from_slice(&m.speed_max.to_le_bytes());
    if protocol >= 3 {
        out.extend_from_slice(&m.brightness_min.to_le_bytes());
        out.extend_from_slice(&m.brightness_max.to_le_bytes());
    }
    out.extend_from_slice(&m.colors_min.to_le_bytes());
    out.extend_from_slice(&m.colors_max.to_le_bytes());
    out.extend_from_slice(&m.speed.to_le_bytes());
    if protocol >= 3 {
        out.extend_from_slice(&m.brightness.to_le_bytes());
    }
    out.extend_from_slice(&m.direction.to_le_bytes());
    out.extend_from_slice(&m.color_mode.to_le_bytes());
    write_colors(out, &m.colors);
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Reader { data, pos: 0 }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        if self.pos + n > self.data.len() {
            return Err(Error::Protocol(format!(
                "pacote terminou antes do esperado (posição {}, faltam {} bytes)",
                self.pos, n
            )));
        }
        let slice = &self.data[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn u16(&mut self) -> Result<u16> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }

    fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }

    fn i32(&mut self) -> Result<i32> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }

    fn string(&mut self) -> Result<String> {
        let len = self.u16()? as usize;
        let bytes = self.take(len)?;
        let bytes = bytes.strip_suffix(&[0]).unwrap_or(bytes);
        Ok(String::from_utf8_lossy(bytes).into_owned())
    }

    fn color(&mut self) -> Result<Color> {
        let b = self.take(4)?;
        Ok(Color { r: b[0], g: b[1], b: b[2] })
    }

    fn colors(&mut self) -> Result<Vec<Color>> {
        let n = self.u16()?;
        (0..n).map(|_| self.color()).collect()
    }
}

fn parse_mode(r: &mut Reader, protocol: u32) -> Result<Mode> {
    let name = r.string()?;
    let value = r.i32()?;
    let flags = r.u32()?;
    let speed_min = r.u32()?;
    let speed_max = r.u32()?;
    let (brightness_min, brightness_max) = if protocol >= 3 {
        (r.u32()?, r.u32()?)
    } else {
        (0, 0)
    };
    let colors_min = r.u32()?;
    let colors_max = r.u32()?;
    let speed = r.u32()?;
    let brightness = if protocol >= 3 { r.u32()? } else { 0 };
    let direction = r.u32()?;
    let color_mode = r.u32()?;
    let colors = r.colors()?;
    Ok(Mode {
        name,
        value,
        flags,
        speed_min,
        speed_max,
        brightness_min,
        brightness_max,
        colors_min,
        colors_max,
        speed,
        brightness,
        direction,
        color_mode,
        colors,
    })
}

fn parse_zone(r: &mut Reader, protocol: u32, start_idx: u32) -> Result<Zone> {
    let name = r.string()?;
    let zone_type = r.u32()?;
    let leds_min = r.u32()?;
    let leds_max = r.u32()?;
    let leds_count = r.u32()?;

    let matrix_size = r.u16()? as usize;
    let matrix = if matrix_size > 0 {
        let height = r.u32()?;
        let width = r.u32()?;
        let map = (0..height * width).map(|_| r.u32()).collect::<Result<Vec<_>>>()?;
        Some(MatrixMap { height, width, map })
    } else {
        None
    };

    let mut segments = Vec::new();
    if protocol >= 4 {
        let n = r.u16()?;
        for _ in 0..n {
            segments.push(Segment {
                name: r.string()?,
                zone_type: r.u32()?,
                start_idx: r.u32()?,
                leds_count: r.u32()?,
            });
        }
    }

    Ok(Zone {
        name,
        zone_type,
        leds_min,
        leds_max,
        leds_count,
        matrix,
        segments,
        start_idx,
    })
}

fn parse_device(data: &[u8], index: u32, protocol: u32) -> Result<Device> {
    let mut r = Reader::new(data);
    let _size = r.u32()?;
    let device_type = r.u32()?;
    let name = r.string()?;
    let vendor = if protocol >= 1 { r.string()? } else { String::new() };
    let description = r.string()?;
    let version = r.string()?;
    let serial = r.string()?;
    let location = r.string()?;

    let num_modes = r.u16()?;
    let active_mode = r.i32()?;
    let modes = (0..num_modes)
        .map(|_| parse_mode(&mut r, protocol))
        .collect::<Result<Vec<_>>>()?;

    let num_zones = r.u16()?;
    let mut zones = Vec::with_capacity(num_zones as usize);
    let mut led_cursor = 0;
    for _ in 0..num_zones {
        let zone = parse_zone(&mut r, protocol, led_cursor)?;
        led_cursor += zone.leds_count;
        zones.push(zone);
    }

    let num_leds = r.u16()?;
    let mut leds = Vec::with_capacity(num_leds as usize);
    for _ in 0..num_leds {
        leds.push(r.string()?);
        let _value = r.u32()?;
    }

    let colors = r.colors()?;

    Ok(Device {
        index,
        device_type,
        name,
        vendor,
        description,
        version,
        serial,
        location,
        active_mode,
        modes,
        zones,
        leds,
        colors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_round_trip() {
        let mode = Mode {
            name: "Static".into(),
            value: 1,
            flags: 0x60,
            speed_min: 0,
            speed_max: 4,
            brightness_min: 0,
            brightness_max: 100,
            colors_min: 1,
            colors_max: 1,
            speed: 2,
            brightness: 100,
            direction: 0,
            color_mode: 2,
            colors: vec![Color { r: 255, g: 16, b: 1 }],
        };
        let mut buf = Vec::new();
        write_mode(&mut buf, &mode, 4);
        let parsed = parse_mode(&mut Reader::new(&buf), 4).unwrap();
        assert_eq!(parsed.name, "Static");
        assert_eq!(parsed.colors, mode.colors);
        assert_eq!(parsed.brightness_max, 100);
        assert_eq!(parsed.color_mode, 2);
    }

    /// Precisa de um servidor rodando:
    /// `cargo test live_server -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_server() {
        let mut client = Client::connect("127.0.0.1", 6742, "RGB Control (teste)").unwrap();
        println!("protocolo {} (servidor {})", client.protocol, client.server_protocol);
        for d in client.devices().unwrap() {
            println!(
                "{}: {} | tipo {} | modo ativo {:?} | {} zonas | {} LEDs | {} cores",
                d.index,
                d.name,
                d.device_type,
                d.modes.get(d.active_mode as usize).map(|m| &m.name),
                d.zones.len(),
                d.leds.len(),
                d.colors.len()
            );
            for m in &d.modes {
                println!(
                    "    modo {:<24} flags {:#06x} color_mode {} brilho {}/{}..{} velocidade {}/{}..{} cores {:?}",
                    m.name,
                    m.flags,
                    m.color_mode,
                    m.brightness,
                    m.brightness_min,
                    m.brightness_max,
                    m.speed,
                    m.speed_min,
                    m.speed_max,
                    m.colors
                );
            }
            assert_eq!(d.leds.len(), d.colors.len());
        }
    }

    #[test]
    fn color_byte_order() {
        let c = Color { r: 0x11, g: 0x22, b: 0x33 };
        assert_eq!(color_to_u32(&c), 0x00332211);
    }
}
