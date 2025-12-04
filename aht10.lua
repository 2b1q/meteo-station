-- AHT10 temperature / humidity sensor (I2C)
-- Uses bus 0, same SDA/SCL as BMP280

local M = {}

local I2C_ID    = 0
local AHT10_ADDR = 0x38

local function write_cmd(cmd_bytes)
  i2c.start(I2C_ID)
  i2c.address(I2C_ID, AHT10_ADDR, i2c.TRANSMITTER)
  i2c.write(I2C_ID, cmd_bytes)
  i2c.stop(I2C_ID)
end

function M.init(id)
  I2C_ID = id or 0

  -- small delay after power up
  tmr.delay(40000)

  -- initialization command: 0xE1 0x08 0x00
  write_cmd(string.char(0xE1, 0x08, 0x00))
end

function M.read()
  -- trigger measurement: 0xAC 0x33 0x00
  write_cmd(string.char(0xAC, 0x33, 0x00))

  -- measurement time ~80ms
  tmr.delay(80000)

  i2c.start(I2C_ID)
  i2c.address(I2C_ID, AHT10_ADDR, i2c.RECEIVER)
  local data = i2c.read(I2C_ID, 6)
  i2c.stop(I2C_ID)

  if not data or #data < 6 then
    return nil, nil
  end

  local b1, b2, b3, b4, b5, b6 = data:byte(1, 6)

  -- if busy bit set, skip this sample
  if bit.isset(b1, 7) then
    return nil, nil
  end

  local raw_h =
      bit.lshift(bit.band(b2, 0xFF), 12) +
      bit.lshift(bit.band(b3, 0xFF), 4) +
      bit.rshift(bit.band(b4, 0xF0), 4)

  local raw_t =
      bit.lshift(bit.band(b4, 0x0F), 16) +
      bit.lshift(bit.band(b5, 0xFF), 8) +
      bit.band(b6, 0xFF)

  local hum  = (raw_h * 100.0) / 0x100000
  local temp = (raw_t * 200.0) / 0x100000 - 50.0

  return temp, hum
end

return M