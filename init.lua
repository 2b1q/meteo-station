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