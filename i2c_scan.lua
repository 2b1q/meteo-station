local SDA, SCL = 2, 1
local I2C_ID = 0

print("[scan] setup I2C on SDA=" .. SDA .. " SCL=" .. SCL)
i2c.setup(I2C_ID, SDA, SCL, i2c.SLOW)

for addr = 0, 127 do
  i2c.start(I2C_ID)
  local res = i2c.address(I2C_ID, addr, i2c.TRANSMITTER)
  i2c.stop(I2C_ID)
  if res then
    print(string.format("[scan] found device at 0x%02X", addr))
  end
end

print("[scan] done")