# ESP8266 Meteo Station (NodeMCU + Lua)

Small meteo / air-quality station based on **NodeMCU (ESP8266)** and **Lua (NodeMCU firmware)**.  
It reads temperature, humidity, pressure and gas sensors, prints debug info to the serial console and shows values on a **MAX7219** LED display.

## Features

- **Temperature & Humidity**
  - **AHT10** (I²C): temperature + relative humidity
  - **BMP280 / BME280** (I²C): temperature + pressure (humidity only if BME280 is used)
  - Average temperature is calculated from *BMP* and *AHT*:
    - `bmp`, `aht`, `avg`
- **Pressure**
  - Sea-level and raw pressure from BMP/BME sensor
- **Gas sensors**
  - **MQ135** – air quality / VOC
  - **MQ3** – alcohol sensor
  - Both sensors are read through an analog input (via multiplexer)
- **Display**
  - **MAX7219** 7-segment or LED module
  - Cycles through values (temperature, pressure, gas readings, etc.)
- **Debug output**
  - Human-readable logs on serial port:
    - `[MEASURE]`, `[BMP]`, `[AHT]`, `[TEMP]`, `[MQ]`, `[DSP]`, `[MAX]`, `[HB]` (heartbeat), etc.
  - Handles sensor errors and falls back to cached values when needed

At the moment the firmware does **no networking** (Wi-Fi modules were removed to save RAM), but the code can be extended later to publish metrics over HTTP/MQTT.

## Hardware

Required components:

- NodeMCU v2 / v3 (ESP8266)
- **BMP280 / BME280** (I²C)
- **AHT10** (I²C)
- **MQ135** gas sensor
- **MQ3** gas/alcohol sensor
- Analog multiplexer (CD4052 or similar, for sharing ADC between MQ sensors)
- **MAX7219** LED display (7-segment or matrix)
- Breadboard / wires, 5V power supply for sensors as required

## PIN OUTS / GPIO Configuration

All pin mappings are defined in `meteo.lua` and use NodeMCU D-pin notation (D0–D8 = GPIO 16, 5, 4, 0, 2, 14, 12, 13, 15):

| **Function** | **NodeMCU Pin** | **GPIO** | **Notes** |
|---|---|---|---|
| **I²C SDA** | D2 | GPIO4 | BMP280 + AHT10 (shared bus) |
| **I²C SCL** | D1 | GPIO5 | BMP280 + AHT10 (shared bus) |
| **MAX7219 DIN** | D7 | GPIO13 | SPI Data In |
| **MAX7219 CS** | D6 | GPIO12 | Chip Select |
| **MAX7219 CLK** | D5 | GPIO14 | SPI Clock |
| **MUX S0** | D0 | GPIO16 | Multiplexer channel bit 0 |
| **MUX S1** | D8 | GPIO15 | Multiplexer channel bit 1 |
| **ADC (MQ135/MQ3)** | A0 | ADC0 | Analog input from MUX output |

### Multiplexer Channels

The CD4052 (or similar) multiplexer routes MQ sensors to the single ADC input:

| **Channel** | **S1** | **S0** | **Sensor** |
|---|---|---|---|
| 0 | 0 | 0 | MQ135 (air quality) |
| 1 | 0 | 1 | MQ3 (alcohol) |

The multiplexer output is connected to NodeMCU **A0** (ADC0).

### I²C Bus Wiring

Both BMP280/BME280 and AHT10 share the same I²C bus:

```
NodeMCU D2 (SDA) ──── BMP280/BME280 SDA
                 \─── AHT10 SDA
                 
NodeMCU D1 (SCL) ──── BMP280/BME280 SCL
                 \─── AHT10 SCL

GND ──────────────── BMP280/BME280 GND
                 \─── AHT10 GND
                 
3.3V ─────────────── BMP280/BME280 VCC
                 \─── AHT10 VCC
```

## Configuration

Tunable parameters are defined at the top of `meteo.lua`:

| **Parameter** | **Value** | **Description** |
|---|---|---|
| `ALT_M` | 200 | Altitude in meters (used to calculate QNH sea-level pressure) |
| Measurement interval | 5000 ms | Set via `tmr.create():alarm(5000, ...)` in `M.start()` |
| Heartbeat interval | 30000 ms | Set via `tmr.create():alarm(30000, ...)` in `M.start()` |
| Display cycle | 4 states | Rotates: MQ135 → MQ3 → Tavg×10 → Pressure |

### MQ Sensor Calibration

The MQ sensors use a **baseline calibration** approach:

- On first read, the raw ADC value is stored as the baseline (`mq135_base`, `mq3_base`)
- Subsequent readings are compared as a ratio to the baseline
- Classification is done using thresholds (e.g., ratio < 0.85 = "cleaner", ratio < 1.20 = "normal", etc.)

Adjust the classification thresholds in `classify_mq135()` and `classify_mq3()` functions as needed.

## Firmware

This project is built on **NodeMCU** firmware with a minimal set of modules to save RAM.

**Required modules:**
- `adc` – analog-to-digital conversion for MQ sensors
- `bit` – bit operations for MUX channel selection
- `bme280` – BMP280/BME280 pressure and temperature sensor
- `file` – file operations (optional, for future use)
- `gpio` – GPIO control
- `i2c` – I²C bus communication
- `node` – node control and heap info
- `spi` – SPI interface (used by MAX7219)
- `tmr` – timers

You need to build a custom NodeMCU firmware for **ESP8266** with at least these modules enabled.  
Any other modules (WiFi, net, http, etc.) are **not** currently used.

## Getting Started

### 1. Build and flash NodeMCU

1. Build a NodeMCU firmware for **ESP8266** with required modules.
2. Flash it to the board using `esptool.py` or any other flashing tool.

Example (adjust port/paths):

```bash
esptool.py --port /dev/ttyUSB0 --baud 921600 write_flash -fm dout 0x00000 nodemcu.bin
```

### 2. Upload Lua scripts

Use any uploader you like (ESPlorer, NodeMCU-Tool, etc.):

```sh
nodemcu-tool upload init.lua meteo.lua aht10.lua max7219.lua --port=/dev/cu.usbserial-21410
[NodeMCU-Tool]~ Connected 
[device]      ~ Arch: esp8266 | Version: 3.0.0 | ChipID: 0x818b5b | FlashID: 0x164020 
[NodeMCU-Tool]~ Uploading "init.lua" >> "init.lua"... 
[connector]   ~ Transfer-Mode: hex 
[NodeMCU-Tool]~ Uploading "meteo.lua" >> "meteo.lua"... 
[NodeMCU-Tool]~ Uploading "aht10.lua" >> "aht10.lua"... 
[NodeMCU-Tool]~ Uploading "max7219.lua" >> "max7219.lua"... 
[NodeMCU-Tool]~ Bulk File Transfer complete! 
[NodeMCU-Tool]~ disconnecting 

nodemcu-tool reset --port=/dev/cu.usbserial-21410
[device]      ~ Hard-Reset executed (100ms) 
[NodeMCU-Tool]~ disconnecting 
```

### 3. Connect via serial

1. Open a serial terminal at 115200 baud.
2. Reset the board.
3. You should see logs similar to:

```
[meteo] timers started
[HB] heap=	20048

[MEASURE] ===
[heap]	20048
[AHT] no new data, using cached
[BMP] T=25.94C P=1002.7 hPa QNH=1026.8
[TEMP] bmp=25.94C aht=26.00C avg=25.97C hum=30.4%
[MUX] ch=0 S0=0 S1=0
[MQ] 135=249 3=161
[MQ135]	normal x1.00
[MQ3]	no alc x1.01
[DSP] MQ135	249
[MAX] shown:	249

[MUX] ch=1 S0=1 S1=0
[MQ] 135=249 3=161
```

The MAX7219 display will show the current value selected by the display cycle logic (temperature, pressure, gas level, etc.).

## How It Works

### Measurement Loop

On each measurement cycle (every 5 seconds):

1. **AHT10 is read:**
    - If there is a new frame, it logs `[AHT] T=... H=...%`
    - If there is no new data, it logs `[AHT] no new data, using cached` and reuses the last valid values

2. **BMP280/BME280 is read:**
    - If values are valid and within reasonable range (temp: -40–85°C, pressure: 800–1100 hPa), the reading is used
    - If out of range or nil, the script logs it and falls back to cached values
    - Logs: `[BMP] T=25.94C P=1002.7 hPa QNH=1026.8`

3. **Average temperature is computed:**
    - If both BMP and AHT are valid: `avg = (bmp_t + aht_t) / 2`
    - If only one is valid: `avg = that_sensor`

4. **MQ135/MQ3 are read via the multiplexer:**
    - Multiplexer channel is switched (S0/S1 pins control which sensor is active)
    - Raw ADC values are read from A0
    - Readings are mapped to a ratio scale and classified
    - Logs: `[MUX] ch=0 S0=0 S1=0` and `[MQ] 135=249 3=161`

5. **The selected metric is sent to MAX7219:**
    - Display cycles through 4 modes:
      - Mode 0: MQ135 raw value
      - Mode 1: MQ3 raw value
      - Mode 2: Tavg × 10 (average temperature)
      - Mode 3: Pressure in hPa
    - Logs: `[DSP] MQ135 249` and `[MAX] shown: 249`

6. **Heartbeat messages** `[HB] heap=...` show memory status every 30 seconds.

The `[AHT] no new data, using cached` messages are **expected and normal** — they simply indicate that the sensor did not provide a new measurement on this particular cycle. The last valid sample is safely reused.

## Troubleshooting

Before running an I²C scan on the board, upload the scanner script to the device:

```bash
nodemcu-tool upload i2c_scan.lua --port=/dev/cu.usbserial-21410
```

Then run the scan:

```bash
nodemcu-tool run i2c_scan.lua --port=/dev/cu.usbserial-21410
```

Expected output (example):

```
[scan] setup I2C on SDA=2 SCL=1
[scan] found device at 0x38
[scan] found device at 0x76
[scan] done
```

If no devices are found, check:
- Wiring: SDA = D2, SCL = D1, common GND, 3.3V power to sensors  
- Pull-ups on the I²C lines (some breakout boards include them)  
- Correct sensor addresses (AHT10 = 0x38, BMP280/BME280 = 0x76/0x77)  
- NodeMCU firmware includes the `i2c` module

You can also let `init.lua` perform an automatic I²C health check on boot (it probes 0x38, 0x76 and 0x77 and prints a summary).

## Roadmap / Ideas

- Add Wi-Fi back (when RAM allows) and publish data to:
  - HTTP endpoint
  - MQTT broker
  - InfluxDB / Prometheus gateway
- Persist calibration values to flash (file API)
- Simple web UI to show current readings
- OTA firmware/script update

---

License: BSD