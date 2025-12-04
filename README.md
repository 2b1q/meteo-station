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
- Analog multiplexer (for sharing ADC between MQ sensors)
- **MAX7219** LED display (7-segment or matrix)
- Breadboard / wires, 5V power supply for sensors as required

Typical connections (example, adjust to your wiring):

- **I²C bus**
  - `SDA` → NodeMCU `D2`
  - `SCL` → NodeMCU `D1`
  - Both BMP/BME and AHT10 are connected to the same I²C bus
- **MAX7219**
  - `DIN`, `CLK`, `CS` connected to three GPIO pins (configured in script)
- **MQ sensors + multiplexer**
  - MQ135 and MQ3 → analog multiplexer inputs  
  - MUX output → NodeMCU `A0`  
  - MUX select pins → two GPIO pins (S0/S1), see log lines like `[MUX] ch=0 S0=0 S1=0`

Check the Lua sources for the exact pin mapping used.

## Firmware

This project is built on **NodeMCU** firmware with a minimal set of modules to save RAM.
Currently used modules:
- `adc`
- `bit`
- `bme280`  (for BMP280/BME280)
- `file`
- `gpio`
- `i2c`
- `node`
- `spi`
- `tmr`

You need to build a custom NodeMCU firmware (for ESP8266) with at least these modules enabled.  
Any other modules (WiFi, net, http, etc.) are optional and currently **not** used.

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
[MEASURE] ===
[heap]	20048
[AHT] no new data, using cached
[BMP] T=25.94C P=1002.7 hPa QNH=1026.8
[TEMP] bmp=25.94C aht=26.00C avg=25.97C hum=30.4%
[MUX] ch=0 S0=0 S1=0
[MUX] ch=1 S0=1 S1=0
[MQ] 135=249 3=161
[MQ135]	normal x1.00
[MQ3]	no alc x1.01
[DSP] MQ135	249
[MAX] shown:	249
```
The MAX7219 display will show the current value selected by the logic (temperature, pressure, gas level, etc.).

## How It Works

Measurement loop

On each measurement cycle:
1. BMP/BME is read:
    - if values are valid and within reasonable range, the reading is used
    - if out of range or nil, the script logs it and temporarily disables BMP data until it stabilizes
2. AHT10 is read:
    - if there is a new frame, it logs `[AHT] T=... H=...%`
    - if there is no new data, it logs `"[AHT] no new data, using cached"` and reuses the last valid values
3. Average temperature is computed:
    - if both BMP and AHT are valid: `avg = (bmp_t + aht_t) / 2`
	- if only one is valid: `avg = that_sensor`
4. MQ135/MQ3 are read via the multiplexer:
	- multiplexer channel is switched
	- raw ADC values are mapped to a simple "x1.xx" scale and logged
5. The selected metric is sent to MAX7219:
	- `[DSP] Tavg*10 ...` or `[DSP] P ...`, etc.
6. Heartbeat messages `[HB] heap=...` show memory status every N cycles.

The `"no new data, using cached"` messages from AHT10 are expected and simply indicate that the sensor did not provide a new measurement on this particular cycle. The last valid sample is reused.

## Configuration

Some parameters can be tuned directly in the Lua sources:
- Measurement interval (in milliseconds)
- MQ135 / MQ3 calibration factors
- Pin mapping for:
    - I²C (SDA, SCL)
	- multiplexer select lines (S0, S1)
	- MAX7219 control pins
	- Thresholds / scaling for what is displayed on MAX7219

Check the constants at the top of `meteo.lua` and helper modules.

## Roadmap / Ideas
- Add Wi-Fi back (when RAM allows) and publish data to:
- HTTP endpoint
- MQTT broker
- InfluxDB / Prometheus gateway
- Persist calibration values to flash (file API)
- Simple web UI to show current readings
- OTA firmware/script update

---
License BSD