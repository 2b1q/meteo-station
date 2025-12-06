-- Meteo station: BMP280 + AHT10 + MQ135/MQ3 + MAX7219 + MQTT (lite)

local M              = {}

-------------------------------------------------------
-- PIN MAP (NodeMCU IO index)
-------------------------------------------------------
local SDA_PIN        = 2 -- D2 I2C SDA (BMP280 + AHT10)
local SCL_PIN        = 1 -- D1 I2C SCL

local DIN_PIN        = 7 -- D7 MAX7219 DIN
local CS_PIN         = 6 -- D6 MAX7219 CS
local CLK_PIN        = 5 -- D5 MAX7219 CLK

local MUX_S0         = 0 -- D0 MQ MUX S0
local MUX_S1         = 8 -- D8 MQ MUX S1

-------------------------------------------------------
-- GLOBAL STATE
-------------------------------------------------------
local ALT_M          = 200 -- altitude (m) for QNH

local bmp_ok         = false
local bmp_fail_count = 0

local mq135_base     = nil
local mq3_base       = nil

local max7219        = nil
local aht10          = nil

local display_cycle  = 0 -- 0: MQ135, 1: MQ3, 2: Tavg*10, 3: P

-- last valid BMP readings
local last_temp      = nil
local last_humi      = nil
local last_press     = nil
local last_qnh       = nil

-- last valid AHT readings
local last_aht_t     = nil
local last_aht_h     = nil

-- WiFi + MQTT
local WIFI_SSID      = ""
local WIFI_PASSWORD  = ""

local MQTT_HOST      = "192.168.1.100"
local MQTT_PORT      = 1883
local MQTT_BASE      = "meteo"

local mqtt_client    = nil
local device_id      = node.chipid()

-------------------------------------------------------
-- WIFI
-------------------------------------------------------
local function wifi_setup()
  if not wifi then
    print("[WIFI] module not present")
    return
  end

  wifi.setmode(wifi.STATION)
  wifi.sta.config({
    ssid = WIFI_SSID,
    pwd  = WIFI_PASSWORD,
    auto = true,
  })
  wifi.sta.connect()
end

-------------------------------------------------------
-- MQTT
-------------------------------------------------------
local function mqtt_connect()
  if not mqtt then
    print("[MQTT] module not present")
    return
  end

  if mqtt_client then
    return
  end

  local client_id    = "meteo-" .. device_id
  local c            = mqtt.Client(client_id, 60)
  local topic_status = MQTT_BASE .. "/" .. device_id .. "/status"

  c:lwt(topic_status, "offline", 0, 1)

  c:on("connect", function(cl)
    print("[MQTT] connected")
    cl:publish(topic_status, "online", 0, 1)
  end)

  c:on("offline", function(_cl)
    print("[MQTT] offline")
    mqtt_client = nil
  end)

  c:connect(
    MQTT_HOST,
    MQTT_PORT,
    0,
    function(_cl)
      print("[MQTT] connect ok " .. MQTT_HOST .. ":" .. MQTT_PORT)
      mqtt_client = c
    end,
    function(_cl, reason)
      print("[MQTT] connect failed: " .. tostring(reason))
      mqtt_client = nil
    end
  )
end

local function mqtt_send(bmp_t, bmp_p, bmp_qnh, aht_t, aht_h, mq135, mq3)
  if not mqtt_client then
    return
  end

  local function jnum(v)
    if v == nil then
      return "null"
    end
    return tostring(v)
  end

  local payload =
      '{"deviceId":' .. device_id ..
      ',"bmp_t":' .. jnum(bmp_t) ..
      ',"bmp_p":' .. jnum(bmp_p) ..
      ',"bmp_qnh":' .. jnum(bmp_qnh) ..
      ',"aht_t":' .. jnum(aht_t) ..
      ',"aht_h":' .. jnum(aht_h) ..
      ',"mq135":' .. jnum(mq135) ..
      ',"mq3":' .. jnum(mq3) ..
      '}'

  local topic = MQTT_BASE .. "/" .. device_id .. "/reading"
  mqtt_client:publish(topic, payload, 0, 0)
end

-------------------------------------------------------
-- BMP280 via bme280 (рабочий вариант с фильтрами)
-------------------------------------------------------
local function bmp_setup()
  if not (bme280 and i2c) then
    print("[BMP] bme280 or i2c not present, skip")
    bmp_ok = false
    return
  end

  local ok, mode_or_err = pcall(bme280.setup)
  if not ok then
    print("[BMP] setup error:", mode_or_err)
    bmp_ok = false
    return
  end

  bmp_ok = true
  bmp_fail_count = 0
  print("[BMP] setup ok, mode:\t" .. tostring(mode_or_err))
end

local function bmp_read()
  if not bmp_ok then
    return nil
  end

  local T, P, H, QNH = bme280.read(ALT_M)
  if T == nil or P == nil then
    print("[BMP] read nil:\t", T, P, H, QNH)
    bmp_fail_count = bmp_fail_count + 1
    print(string.format("[BMP] read failed (%d in a row)", bmp_fail_count))

    if bmp_fail_count >= 3 then
      print("[BMP] too many failures, re-running setup()")
      bmp_setup()
    end

    return nil
  end

  local temp         = T / 100.0  -- °C
  local pressure     = P / 1000.0 -- hPa
  local humi         = H and (H / 1000.0) or nil
  local qnh          = QNH and (QNH / 1000.0) or nil

  -- sanity filters
  local out_of_range = false

  if temp < -40 or temp > 85 then
    print(string.format("[BMP] out range temp: T=%.2f P=%.1f", temp, pressure))
    out_of_range = true
  end

  if pressure < 800 or pressure > 1100 then
    print(string.format("[BMP] out range press: T=%.2f P=%.1f", temp, pressure))
    out_of_range = true
  end

  if out_of_range then
    bmp_fail_count = bmp_fail_count + 1
    print(string.format("[BMP] bad reading (%d in a row)", bmp_fail_count))

    if bmp_fail_count >= 3 then
      print("[BMP] too many bad readings, re-running setup()")
      bmp_setup()
    end

    return nil
  end

  bmp_fail_count = 0

  local qnh_str  = qnh and string.format("%.1f", qnh) or "N/A"
  print(string.format("[BMP] T=%.2fC P=%.1f hPa QNH=%s", temp, pressure, qnh_str))

  return temp, humi, pressure, qnh
end

-------------------------------------------------------
-- AHT10
-------------------------------------------------------
local function aht_setup()
  local ok, mod = pcall(require, "aht10")
  if not ok then
    print("[AHT] require err:", tostring(mod))
    aht10 = nil
    return
  end

  aht10 = mod

  if aht10.init then
    local ok2, err2 = pcall(aht10.init, 0) -- bus 0
    if not ok2 then
      print("[AHT] init err:", tostring(err2))
      aht10 = nil
    else
      print("[AHT] init ok on bus 0")
    end
  else
    print("[AHT] no init()")
  end
end

local function aht_read()
  if not aht10 or not aht10.read then
    return last_aht_t, last_aht_h, false
  end

  local ok, t, h = pcall(aht10.read)
  if not ok then
    print("[AHT] read err:", tostring(t))
    return last_aht_t, last_aht_h, false
  end

  if t and h then
    if t < -40 or t > 85 then
      print(string.format("[AHT] out of range T=%.2f H=%.1f%%, ignoring", t, h))
      return last_aht_t, last_aht_h, false
    end

    last_aht_t = t
    last_aht_h = h
    print(string.format("[AHT] T=%.2fC H=%.1f%%", t, h))
    return t, h, true
  end

  return last_aht_t, last_aht_h, false
end

-------------------------------------------------------
-- MQ sensors via MUX + ADC
-------------------------------------------------------
local function mux_select(channel)
  local b0 = bit.isset(channel, 0) and gpio.HIGH or gpio.LOW
  local b1 = bit.isset(channel, 1) and gpio.HIGH or gpio.LOW
  gpio.write(MUX_S0, b0)
  gpio.write(MUX_S1, b1)
end

local function read_mq(channel)
  mux_select(channel)
  tmr.delay(1000)
  return adc.read(0)
end

-------------------------------------------------------
-- MAX7219
-------------------------------------------------------
local function max_init()
  local ok, mod = pcall(require, "max7219")
  if not ok then
    print("[MAX] require err:\t" .. tostring(mod))
    return
  end
  max7219 = mod
  local ok2, err2 = pcall(max7219.init, DIN_PIN, CS_PIN, CLK_PIN)
  if not ok2 then
    print("[MAX] init ERR:\t" .. tostring(err2))
    max7219 = nil
  else
    print("[MAX] init ok")
  end
end

local function max_show(value)
  if not max7219 or not max7219.showInteger then
    return
  end
  pcall(max7219.showInteger, value)
end

-------------------------------------------------------
-- MEASURE + DISPLAY
-------------------------------------------------------
local function measure()
  -- BMP first (важно для шины I2C с AHT)
  local bmp_t, bmp_h, bmp_p, bmp_qnh = bmp_read()

  if bmp_t then
    last_temp  = bmp_t
    last_humi  = bmp_h
    last_press = bmp_p
    last_qnh   = bmp_qnh
  else
    if last_temp then
      bmp_t   = last_temp
      bmp_h   = last_humi
      bmp_p   = last_press
      bmp_qnh = last_qnh
      print("[BMP] no fresh data, using cached")
    else
      print("[BMP] no data at all yet")
    end
  end

  -- AHT second
  local aht_t, aht_h, _aht_new = aht_read()

  -- avg temp
  local t_avg = nil
  local t_count = 0
  if bmp_t then
    t_avg = (t_avg or 0) + bmp_t
    t_count = t_count + 1
  end
  if aht_t then
    t_avg = (t_avg or 0) + aht_t
    t_count = t_count + 1
  end
  if t_count > 0 then
    t_avg = t_avg / t_count
  end

  -- MQ
  local mq135 = read_mq(0)
  local mq3   = read_mq(1)

  -- Если бек (MQTT) не готов — просто печатаем телеметрию
  if not mqtt_client then
    print(
      string.format(
        "[TEL] bt=%s bp=%s at=%s ah=%s mq135=%s mq3=%s",
        tostring(bmp_t or "nil"),
        tostring(bmp_p or "nil"),
        tostring(aht_t or "nil"),
        tostring(aht_h or "nil"),
        tostring(mq135 or "nil"),
        tostring(mq3 or "nil")
      )
    )
  end

  -- Отправка в MQTT, когда клиент есть
  mqtt_send(bmp_t, bmp_p, bmp_qnh, aht_t, aht_h, mq135, mq3)

  -- Display rotation
  display_cycle = (display_cycle + 1) % 4
  local disp_val

  if display_cycle == 0 then
    disp_val = mq135 or 0
  elseif display_cycle == 1 then
    disp_val = mq3 or 0
  elseif display_cycle == 2 then
    local t_for_disp = t_avg or bmp_t or aht_t
    if t_for_disp then
      disp_val = math.floor(t_for_disp * 10 + 0.5)
    else
      disp_val = 0
    end
  else
    if bmp_p then
      disp_val = math.floor(bmp_p + 0.5)
    else
      disp_val = 0
    end
  end

  max_show(disp_val or 0)
end

-------------------------------------------------------
-- PUBLIC START
-------------------------------------------------------
function M.start()
  -- MUX pins
  gpio.mode(MUX_S0, gpio.OUTPUT)
  gpio.mode(MUX_S1, gpio.OUTPUT)
  gpio.write(MUX_S0, gpio.LOW)
  gpio.write(MUX_S1, gpio.LOW)

  -- ADC init
  if adc and adc.force_init_mode then
    adc.force_init_mode(adc.INIT_ADC)
  end

  -- I2C init (shared)
  if i2c then
    i2c.setup(0, SDA_PIN, SCL_PIN, i2c.SLOW)
  end

  wifi_setup()

  -- порядок: сначала BMP, потом AHT (по опыту)
  bmp_setup()
  aht_setup()

  max_init()
  mqtt_connect()

  -- periodic MQTT reconnect
  tmr.create():alarm(60000, tmr.ALARM_AUTO, mqtt_connect)

  -- measurement timer
  tmr.create():alarm(5000, tmr.ALARM_AUTO, measure)

  print("[meteo] timers started")
end

return M
