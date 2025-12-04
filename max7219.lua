-- MAX7219 driver BCD decode mode for 8-digit 7-segment display

local M = {}

local DIN_PIN, CS_PIN, CLK_PIN

local function pulseClock()
    gpio.write(CLK_PIN, gpio.HIGH)
    gpio.write(CLK_PIN, gpio.LOW)
end

local function shiftOut(byte)
    for i = 7, 0, -1 do
        if bit.isset(byte, i) then
            gpio.write(DIN_PIN, gpio.HIGH)
        else
            gpio.write(DIN_PIN, gpio.LOW)
        end
        pulseClock()
    end
end

local function sendCommand(addr, data)
    gpio.write(CS_PIN, gpio.LOW)
    shiftOut(addr)
    shiftOut(data)
    gpio.write(CS_PIN, gpio.HIGH)
end

function M.init(din, cs, clk)
    DIN_PIN = din
    CS_PIN  = cs
    CLK_PIN = clk

    gpio.mode(DIN_PIN, gpio.OUTPUT)
    gpio.mode(CS_PIN, gpio.OUTPUT)
    gpio.mode(CLK_PIN, gpio.OUTPUT)

    gpio.write(CS_PIN, gpio.HIGH)
    gpio.write(CLK_PIN, gpio.LOW)

    -- disable display test mode
    sendCommand(0x0F, 0x00)
    -- enable BCD decode for digits 0..7
    sendCommand(0x09, 0xFF)
    -- (0x00..0x0F) brightness 1..16
    sendCommand(0x0A, 0x08)
    -- amount of digits to be displayed = 8 (0..7)
    sendCommand(0x0B, 0x07)
    -- enable indicator
    sendCommand(0x0C, 0x01)

    M.clear()
end

function M.clear()
    for pos = 1, 8 do
        -- 0x0F in decode mode = "blank"
        sendCommand(pos, 0x0F)
    end
end

-- show integer n in range 0..99999999
function M.showInteger(n)
    if n < 0 then n = 0 end
    if n > 99999999 then n = 99999999 end

    for pos = 1, 8 do
        local digit = n % 10
        sendCommand(pos, digit)
        n = math.floor(n / 10)

        if n == 0 then
            -- clear remaining higher digits
            for p = pos + 1, 8 do
                sendCommand(p, 0x0F)
            end
            break
        end
    end
end

return M
