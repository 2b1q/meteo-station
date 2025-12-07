import React, { useEffect, useState } from "react";
import { LineChart, type LinePoint } from "./components/LineChart";

type MeteoReading = {
  deviceId: number | string;
  bmp_t: number | null;
  bmp_p: number | null;
  bmp_qnh: number | null;
  aht_t: number | null;
  aht_h: number | null;
  mq135: number | null;
  mq3: number | null;
};

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:4000/ws";

export const App: React.FC = () => {
  const [tempSeries, setTempSeries] = useState<LinePoint[]>([]);
  const [mq135Series, setMq135Series] = useState<LinePoint[]>([]);
  const [mq3Series, setMq3Series] = useState<LinePoint[]>([]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      const data: MeteoReading = JSON.parse(event.data);
      const ts = Date.now();

      // temperature: prefer AHT, fallback to BMP if missing
      const temp = data.aht_t ?? data.bmp_t;
      if (temp != null) {
        setTempSeries((prev) => [
          ...prev.slice(-200),
          { ts, value: temp },
        ]);
      }

      if (data.mq135 != null) {
        setMq135Series((prev) => [
          ...prev.slice(-200),
          { ts, value: data.mq135 as number },
        ]);
      }

      if (data.mq3 != null) {
        setMq3Series((prev) => [
          ...prev.slice(-200),
          { ts, value: data.mq3 as number },
        ]);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Meteo Station</h1>

      <h2>Temperature (°C)</h2>
      <LineChart data={tempSeries} />

      <h2>MQ135 raw</h2>
      <LineChart data={mq135Series} />

      <h2>MQ3 raw</h2>
      <LineChart data={mq3Series} />
    </div>
  );
};

export default App;