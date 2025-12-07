import React, { useEffect, useState } from "react"
import "./App.css"
import type { MeteoReading } from "./types"
import { useSeries } from "./hooks/useSeries"
import LineChart, { type ChartSeries } from "./components/LineChart"
import { hPaToMmHg, toNumberOrNull } from "./helpers/chart"

const WS_URL =
  (import.meta as any).env?.VITE_WS_URL || "ws://localhost:4000/ws"

const App: React.FC = () => {
  const [deviceId, setDeviceId] = useState<string | number | null>(null)

  // AHT
  const ahtTemp = useSeries()
  const ahtHum = useSeries()
  // BMP
  const bmpTemp = useSeries()
  const bmpPressMm = useSeries()
  // MQ
  const mq135 = useSeries()
  const mq3 = useSeries()

  useEffect(() => {
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log("[WS] connected to", WS_URL)
    }

    ws.onmessage = event => {
      try {
        const raw = JSON.parse(event.data) as MeteoReading
        const ts = Date.parse(raw.ts) || Date.now()

        setDeviceId(raw.deviceId)

        const bmpT = toNumberOrNull(raw.bmp_t)
        const bmpP = toNumberOrNull(raw.bmp_p)
        const bmpPmm = hPaToMmHg(bmpP)

        const ahtT = toNumberOrNull(raw.aht_t)
        const ahtH = toNumberOrNull(raw.aht_h)
        const mq135v = toNumberOrNull(raw.mq135)
        const mq3v = toNumberOrNull(raw.mq3)

        ahtTemp.addPoint(ts, ahtT)
        ahtHum.addPoint(ts, ahtH)

        bmpTemp.addPoint(ts, bmpT)
        bmpPressMm.addPoint(ts, bmpPmm)

        mq135.addPoint(ts, mq135v)
        mq3.addPoint(ts, mq3v)
      } catch (err) {
        console.error("[WS] failed to parse message", err)
      }
    }

    ws.onerror = err => {
      console.error("[WS] error", err)
    }

    ws.onclose = () => {
      console.warn("[WS] closed")
    }

    return () => {
      ws.close()
    }
  }, [ahtTemp, ahtHum, bmpTemp, bmpPressMm, mq135, mq3])

  const ahtSeries: ChartSeries[] = [
    {
      id: "aht_t",
      label: "Temperature",
      unit: "°C",
      color: "#1f77b4",
      points: ahtTemp.points,
    },
    {
      id: "aht_h",
      label: "Humidity",
      unit: "%",
      color: "#2ca02c",
      points: ahtHum.points,
    },
  ]

  const bmpTempSeries: ChartSeries[] = [
    {
      id: "bmp_t",
      label: "Temperature",
      unit: "°C",
      color: "#d62728",
      points: bmpTemp.points,
    },
  ]

  const bmpPressSeries: ChartSeries[] = [
    {
      id: "bmp_p_mm",
      label: "Pressure",
      unit: "mmHg",
      color: "#7e22ce",
      points: bmpPressMm.points,
    },
  ]

  const mq135Series: ChartSeries[] = [
    {
      id: "mq135",
      label: "MQ135 raw",
      color: "#111827",
      points: mq135.points,
    },
  ]

  const mq3Series: ChartSeries[] = [
    {
      id: "mq3",
      label: "MQ3 raw",
      color: "#111827",
      points: mq3.points,
    },
  ]

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1 className="app-title">Meteo Station</h1>
          <p className="app-subtitle">
            Live data from NodeMCU sensors
            {deviceId && (
              <>
                {" • "}
                Device ID: <span className="app-device">{String(deviceId)}</span>
              </>
            )}
          </p>
        </div>
      </header>

      <main className="app-main">
        <LineChart
          title="AHT10: Temperature & Humidity"
          yLabel="°C / %"
          series={ahtSeries}
        />

        <LineChart
          title="BMP280: Temperature"
          yLabel="°C"
          series={bmpTempSeries}
        />

        <LineChart
          title="BMP280: Pressure"
          yLabel="mmHg"
          series={bmpPressSeries}
          reference={{
            value: 760,
            label: "Sea level 760 mmHg",
            color: "#f97316",
          }}
        />

        <LineChart
          title="MQ135 raw"
          yLabel="ADC value"
          series={mq135Series}
        />

        <LineChart
          title="MQ3 raw"
          yLabel="ADC value"
          series={mq3Series}
        />
      </main>
    </div>
  )
}

export default App