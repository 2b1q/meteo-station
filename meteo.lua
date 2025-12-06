-- BMP280 (via bme280) + AHT10 + MQ135/MQ3 + MAX7219 7-seg

local M = {}

-------------------------------------------------------
-- PIN MAP (NodeMCU D0..D8 as "IO index")
-------------------------------------------------------
local D0, D1, D2, D3, D4, D5, D6, D7, D8 = 0, 1, 2, 3, 4, 5, 6, 7, 8

local SDA_PIN = D2 -- I2C SDA (BMP280 + AHT10)
local SCL_PIN = D1 -- I2C SCL (BMP280 + AHT10)

local DIN_PIN = D7 -- MAX7219 DIN
local CS_PIN  = D6 -- MAX7219 CS
local CLK_PIN = D5 -- MAX7219 CLK

local MUX_S0  = D0 -- MQ MUX S0
local MUX_S1  = D8 -- MQ MUX S1

-------------------------------------------------------
-- GLOBALS
-------------------------------------------------------
local ALT_M = 200      -- altitude (m) for QNH

local bmp_ok          = false
local bmp_fail_count  = 0

local mq135_base = nil
local mq3_base   = nil

local max7219 = nil
local aht10   = nil

local display_cycle = 0 -- 0: MQ135, 1: MQ3, 2: Tavg*10, 3: P

-- last valid BMP readings
local last_temp    = nil
local last_humi    = nil
local last_press   = nil
local last_qnh     = nil

-- last valid AHT readings
local last_aht_t   = nil
local last_aht_h   = nil

-------------------------------------------------------
-- HELPERS
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
-- BMP280 via bme280 C module
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

  local temp     = T / 100.0      -- °C
  local pressure = P / 1000.0     -- hPa
  local humi     = H and (H / 1000.0) or nil
  local qnh      = QNH and (QNH / 1000.0) or nil

  -- sanity filters: treat out-of-range as failure too
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
-- AHT10 (Lua driver, same I2C bus)
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
    if last_aht_t then
      print("[AHT] using cached after error")
    else
      print("[AHT] no valid data yet")
    end
    return last_aht_t, last_aht_h, false
  end

  if t and h then
    -- filter obviously insane startup spikes
    if t < -40 or t > 85 then
      print(string.format("[AHT] out of range T=%.2f H=%.1f%%, ignoring", t, h))
      return last_aht_t, last_aht_h, false
    end

    last_aht_t = t
    last_aht_h = h
    print(string.format("[AHT] T=%.2fC H=%.1f%%", t, h))
    return t, h, true
  end

  -- no new data from sensor, fall back to cache
  if last_aht_t then
    print("[AHT] no new data, using cached")
  else
    print("[AHT] no valid data yet")
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
  print(string.format("[MUX] ch=%d S0=%d S1=%d", channel, b0, b1))
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
    print("[MQ135] base\t" .. mq135_base)
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
    print("[MQ3] base\t" .. mq3_base)
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
  local ok, err = pcall(max7219.showInteger, value)
  if not ok then
    print("[MAX] show ERR:\t" .. tostring(err))
  else
    print("[MAX] shown:\t" .. tostring(value))
  end
end

-------------------------------------------------------
-- MEASURE + DISPLAY
-------------------------------------------------------
local function measure()
  print("\n[MEASURE] ===")
  print("[heap]\t" .. node.heap())

  ---------------------------------------------------
  -- 1) BMP280 FIRST (like in working logs)
  ---------------------------------------------------
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

  ---------------------------------------------------
  -- 2) AHT10 SECOND (uses same I2C bus)
  ---------------------------------------------------
  local aht_t, aht_h, aht_new = aht_read()

  ---------------------------------------------------
  -- Combined temperature / humidity log
  ---------------------------------------------------
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

  local bmp_str = bmp_t and string.format("%.2f", bmp_t) or "N/A"
  local aht_str = aht_t and string.format("%.2f", aht_t) or "N/A"
  local avg_str = t_avg and string.format("%.2f", t_avg) or "N/A"
  local hum_str = aht_h and string.format("%.1f%%", aht_h) or "N/A"

  print(string.format("[TEMP] bmp=%sC aht=%sC avg=%sC hum=%s",
    bmp_str, aht_str, avg_str, hum_str))

  ---------------------------------------------------
  -- MQ sensors
  ---------------------------------------------------
  local mq135 = read_mq(0)
  local mq3   = read_mq(1)

  print(string.format("[MQ] 135=%s 3=%s",
    tostring(mq135), tostring(mq3)))
  print("[MQ135]\t" .. classify_mq135(mq135))
  print("[MQ3]\t" .. classify_mq3(mq3))

  ---------------------------------------------------
  -- Display rotation
  ---------------------------------------------------
  display_cycle = (display_cycle + 1) % 4
  local disp_val

  if display_cycle == 0 then
    disp_val = mq135 or 0
    print("[DSP] MQ135\t" .. tostring(disp_val))
  elseif display_cycle == 1 then
    disp_val = mq3 or 0
    print("[DSP] MQ3\t" .. tostring(disp_val))
  elseif display_cycle == 2 then
    local t_for_disp = t_avg or bmp_t or aht_t
    if t_for_disp then
      disp_val = math.floor(t_for_disp * 10 + 0.5)
    else
      disp_val = 0
    end
    print("[DSP] Tavg*10\t" .. tostring(disp_val))
  else
    if bmp_p then
      disp_val = math.floor(bmp_p + 0.5)
    else
      disp_val = 0
    end
    print("[DSP] P\t" .. tostring(disp_val))
  end

  max_show(disp_val or 0)
end

local function safe_measure()
  local ok, err = pcall(measure)
  if not ok then
    print("[ERR] measure:\t" .. tostring(err))
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

  -- ADC init (single mode)
  if adc and adc.force_init_mode then
    adc.force_init_mode(adc.INIT_ADC)
  end

  -- I2C init (shared by BMP + AHT)
  if i2c then
    i2c.setup(0, SDA_PIN, SCL_PIN, i2c.SLOW)
  end

  aht_setup()
  bmp_setup()
  max_init()

  -- heartbeat
  tmr.create():alarm(30000, tmr.ALARM_AUTO, function()
    print("[HB] heap=\t" .. node.heap())
  end)

  -- measurement timer
  tmr.create():alarm(5000, tmr.ALARM_AUTO, safe_measure)

  print("[meteo] timers started")
end

return M