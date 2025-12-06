-- BMP280 (via bme280) + AHT10 + MQ135/MQ3 + MAX7219 7-seg + MQTT

local M              = {}

-------------------------------------------------------
-- PIN MAP (NodeMCU IO index)
-------------------------------------------------------
local SDA_PIN        = 2 -- D2 I2C SDA
local SCL_PIN        = 1 -- D1 I2C SCL

local DIN_PIN        = 7 -- D7 MAX7219 DIN
local CS_PIN         = 6 -- D6 MAX7219 CS
local CLK_PIN        = 5 -- D5 MAX7219 CLK

local MUX_S0         = 0 -- D0 MQ mux S0
local MUX_S1         = 8 -- D8 MQ mux S1

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
local WIFI_SSID      = "YOUR_WIFI_SSID"
local WIFI_PASSWORD  = "YOUR_WIFI_PASSWORD"

local MQTT_HOST      = "192.168.1.100"
local MQTT_PORT      = 1883
local MQTT_BASE      = "meteo"
local MQTT_QOS       = 0
local MQTT_RETAIN    = 0

local mqtt_client    = nil
local device_id      = node.chipid()

-------------------------------------------------------
-- GPIO HELPERS
-------------------------------------------------------
local function safe_gpio_mode(pin, mode, label)
  local ok, err = pcall(gpio.mode, pin, mode)
  if not ok then
    print("[GPIO] mode ERR", label or "?", pin, err)
  end
end

local function safe_gpio_write(pin, val, label)
  local ok, err = pcall(gpio.write, pin, val)
  if not ok then
    print("[GPIO] write ERR", label or "?", pin, err)
  end
end

-------------------------------------------------------
-- WIFI
-------------------------------------------------------
local function wifi_setup()
  if not wifi then
    print("[WIFI] module not present, skip")
    return
  end

  wifi.setmode(wifi.STATION)

  wifi.sta.config({
    ssid = WIFI_SSID,
    pwd  = WIFI_PASSWORD,
    auto = true,
  })

  wifi.sta.connect()

  tmr.create():alarm(5000, tmr.ALARM_AUTO, function(t)
    local ip = wifi.sta.getip()
    if ip then
      print("[WIFI] IP=" .. ip)
      t:unregister()
    else
      print("[WIFI] waiting for IP...")
    end
  end)
end

-------------------------------------------------------
-- MQTT
-------------------------------------------------------
local function mqtt_connect()
  if not mqtt then
    print("[MQTT] module not present, skip")
    return
  end

  if mqtt_client then
    return
  end

  local client_id    = "meteo-" .. device_id
  local c            = mqtt.Client(client_id, 60)

  local topic_status = MQTT_BASE .. "/" .. device_id .. "/status"

  c:lwt(topic_status, "offline", MQTT_QOS, MQTT_RETAIN)

  c:on("connect", function(cl)
    print("[MQTT] connected")
    cl:publish(topic_status, "online", MQTT_QOS, MQTT_RETAIN)
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

local function mqtt_publish_raw(topic, payload)
  local c = mqtt_client
  if not c then
    return
  end
  local ok, err = pcall(function()
    c:publish(topic, payload, MQTT_QOS, MQTT_RETAIN)
  end)
  if not ok then
    print("[MQTT] publish ERR: " .. tostring(err))
  end
end

local function publish_measurement(bmp_t, bmp_p, bmp_qnh, aht_t, aht_h, mq135, mq3)
  if not sjson then
    return
  end

  local payload = {
    deviceId = device_id,
    bmp = { t = bmp_t, p = bmp_p, qnh = bmp_qnh },
    aht = { t = aht_t, h = aht_h },
    mq135 = mq135,
    mq3 = mq3,
  }

  local ok, encoded = pcall(sjson.encode, payload)
  if not ok then
    print("[MQTT] sjson ERR: " .. tostring(encoded))
    return
  end

  local topic = MQTT_BASE .. "/" .. device_id .. "/reading"
  mqtt_publish_raw(topic, encoded)
end

-------------------------------------------------------
-- BMP280 via bme280
-------------------------------------------------------
local function bmp_setup()
  if not (bme280 and i2c) then
    print("[BMP] bme280 or i2c missing")
    bmp_ok = false
    return
  end

  local ok, mode_or_err = pcall(bme280.setup)
  if not ok then
    print("[BMP] setup error: " .. tostring(mode_or_err))
    bmp_ok = false
    return
  end

  bmp_ok = true
  bmp_fail_count = 0
  print("[BMP] setup ok, mode " .. tostring(mode_or_err))
end

local function bmp_read()
  if not bmp_ok then
    return nil
  end

  local T, P, H, QNH = bme280.read(ALT_M)
  if T == nil or P == nil then
    bmp_fail_count = bmp_fail_count + 1
    print("[BMP] read nil, fail " .. bmp_fail_count)

    if bmp_fail_count >= 3 then
      print("[BMP] re-setup")
      bmp_setup()
    end

    return nil
  end

  local temp     = T / 100.0
  local pressure = P / 1000.0
  local humi     = H and (H / 1000.0) or nil
  local qnh      = QNH and (QNH / 1000.0) or nil

  local out      = false
  if temp < -40 or temp > 85 then
    out = true
  end
  if pressure < 800 or pressure > 1100 then
    out = true
  end

  if out then
    bmp_fail_count = bmp_fail_count + 1
    print("[BMP] out-of-range, fail " .. bmp_fail_count)

    if bmp_fail_count >= 3 then
      print("[BMP] re-setup after bad")
      bmp_setup()
    end

    return nil
  end

  bmp_fail_count = 0
  print(string.format("[BMP] T=%.2fC P=%.1f", temp, pressure))

  return temp, humi, pressure, qnh
end

-------------------------------------------------------
-- AHT10
-------------------------------------------------------
local function aht_setup()
  local ok, mod = pcall(require, "aht10")
  if not ok then
    print("[AHT] require err: " .. tostring(mod))
    aht10 = nil
    return
  end

  aht10 = mod

  if aht10.init then
    local ok2, err2 = pcall(aht10.init, 0)
    if not ok2 then
      print("[AHT] init err: " .. tostring(err2))
      aht10 = nil
    else
      print("[AHT] init ok")
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
    print("[AHT] read err: " .. tostring(t))
    return last_aht_t, last_aht_h, false
  end

  if t and h then
    if t < -40 or t > 85 then
      print("[AHT] insane T, ignore")
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
  safe_gpio_write(MUX_S0, b0, "MUX_S0")
  safe_gpio_write(MUX_S1, b1, "MUX_S1")
end

local function read_mq(channel)
  mux_select(channel)
  tmr.delay(1000)
  return adc.read(0)
end

local function classify_mq135(raw)
  if not raw then return "N/A" end
  if not mq135_base then
    mq135_base = raw
    print("[MQ135] base " .. mq135_base)
  end
  local ratio = raw / mq135_base
  local label
  if ratio < 0.85 then
    label = "cleaner"
  elseif ratio < 1.20 then
    label = "normal"
  elseif ratio < 1.50 then
    label = "elevated"
  elseif ratio < 2.00 then
    label = "poor"
  else
    label = "very bad"
  end
  return string.format("%s x%.2f", label, ratio)
end

local function classify_mq3(raw)
  if not raw then return "N/A" end
  if not mq3_base then
    mq3_base = raw
    print("[MQ3] base " .. mq3_base)
  end
  local ratio = raw / mq3_base
  local label
  if ratio < 1.10 then
    label = "no alc"
  elseif ratio < 1.40 then
    label = "trace"
  elseif ratio < 2.00 then
    label = "mild"
  else
    label = "high"
  end
  return string.format("%s x%.2f", label, ratio)
end

-------------------------------------------------------
-- MAX7219
-------------------------------------------------------
local function max_init()
  local ok, mod = pcall(require, "max7219")
  if not ok then
    print("[MAX] require err: " .. tostring(mod))
    return
  end
  max7219 = mod
  local ok2, err2 = pcall(max7219.init, DIN_PIN, CS_PIN, CLK_PIN)
  if not ok2 then
    print("[MAX] init ERR: " .. tostring(err2))
    max7219 = nil
  else
    print("[MAX] init ok")
  end
end

local function max_show(value)
  if not max7219 or not max7219.showInteger then
    return
  end
  local ok, err = pcall(max7219.showInteger, value)
  if not ok then
    print("[MAX] show ERR: " .. tostring(err))
  end
end

-------------------------------------------------------
-- MEASURE + DISPLAY
-------------------------------------------------------
local function measure()
  print("\n[MEASURE] ===")
  print("[heap] " .. node.heap())

  -- BMP first
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
    end
  end

  -- AHT second
  local aht_t, aht_h, _aht_new = aht_read()

  -- average temp
  local t_avg = nil
  local count = 0
  if bmp_t then
    t_avg = (t_avg or 0) + bmp_t
    count = count + 1
  end
  if aht_t then
    t_avg = (t_avg or 0) + aht_t
    count = count + 1
  end
  if count > 0 then
    t_avg = t_avg / count
  end

  local bmp_str = bmp_t and string.format("%.2f", bmp_t) or "N/A"
  local aht_str = aht_t and string.format("%.2f", aht_t) or "N/A"
  local avg_str = t_avg and string.format("%.2f", t_avg) or "N/A"
  local hum_str = aht_h and string.format("%.1f%%", aht_h) or "N/A"

  print(string.format("[TEMP] bmp=%s aht=%s avg=%s hum=%s",
    bmp_str, aht_str, avg_str, hum_str))

  -- MQ sensors
  local mq135 = read_mq(0)
  local mq3   = read_mq(1)

  print(string.format("[MQ] 135=%s 3=%s", tostring(mq135), tostring(mq3)))
  print("[MQ135] " .. classify_mq135(mq135))
  print("[MQ3] " .. classify_mq3(mq3))

  -- MQTT
  publish_measurement(bmp_t, bmp_p, bmp_qnh, aht_t, aht_h, mq135, mq3)

  -- display rotation
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

local function safe_measure()
  local ok, err = pcall(measure)
  if not ok then
    print("[ERR] measure: " .. tostring(err))
  end
end

-------------------------------------------------------
-- PUBLIC START
-------------------------------------------------------
function M.start()
  -- MUX pins
  safe_gpio_mode(MUX_S0, gpio.OUTPUT, "MUX_S0")
  safe_gpio_mode(MUX_S1, gpio.OUTPUT, "MUX_S1")
  safe_gpio_write(MUX_S0, gpio.LOW, "MUX_S0")
  safe_gpio_write(MUX_S1, gpio.LOW, "MUX_S1")

  -- ADC init
  if adc and adc.force_init_mode then
    adc.force_init_mode(adc.INIT_ADC)
  end

  -- I2C init
  if i2c then
    i2c.setup(0, SDA_PIN, SCL_PIN, i2c.SLOW)
  end

  wifi_setup()
  aht_setup()
  bmp_setup()
  max_init()
  mqtt_connect()

  -- periodic reconnect
  tmr.create():alarm(60000, tmr.ALARM_AUTO, mqtt_connect)

  -- heartbeat
  tmr.create():alarm(30000, tmr.ALARM_AUTO, function()
    print("[HB] heap=" .. node.heap())
  end)

  -- measurement timer
  tmr.create():alarm(5000, tmr.ALARM_AUTO, safe_measure)

  print("[meteo] timers started")
end

return M
