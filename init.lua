print("[init] booting...")

-- I2C setup (same pins as in meteo.lua)
local SDA, SCL = 2, 1 -- D2, D1 on NodeMCU
local I2C_ID = 0

i2c.setup(I2C_ID, SDA, SCL, i2c.SLOW)
print(string.format("[init] I2C setup on SDA=%d SCL=%d", SDA, SCL))

local function i2c_present(addr)
  i2c.start(I2C_ID)
  local ok = i2c.address(I2C_ID, addr, i2c.TRANSMITTER)
  i2c.stop(I2C_ID)
  return ok
end

-- Quick health check: AHT10 (0x38), BMP/BME280 (0x76 / 0x77)
_G.AHT_OK = i2c_present(0x38)
local bmp76 = i2c_present(0x76)
local bmp77 = i2c_present(0x77)
_G.BMP_OK = bmp76 or bmp77

print(string.format(
  "[init] AHT10: %s, BMP: %s (0x76=%s 0x77=%s)",
  AHT_OK and "OK" or "MISSING",
  BMP_OK and "OK" or "MISSING",
  bmp76 and "YES" or "NO",
  bmp77 and "YES" or "NO"
))

print("[init] will start meteo.lua in 5s (time window for uploads)")

local function safe_start_meteo()
  print("[init] running meteo.lua")

  local ok, err = pcall(function()
    local m = require("meteo")
    if m and m.start then
      m.start()
    else
      print("[init] meteo.lua has no start()")
    end
  end)

  if not ok then
    print("[init] meteo.lua error:\t" .. tostring(err))
  end
end

-- Give time to connect with nodemcu-tool after reset
tmr.create():alarm(5000, tmr.ALARM_SINGLE, safe_start_meteo)
