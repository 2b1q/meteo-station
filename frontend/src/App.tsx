import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { TimeRangeId, TIME_RANGES, TimeRangeSelector } from './components/TimeRangeSelector';
import { ChartCard } from './components/ChartCard';
import { ChartSeries } from './components/TimeSeriesChart';
import { TimePoint } from './helpers/timeseries';

type MetricKey = 'aht_t' | 'aht_h' | 'bmp_t' | 'bmp_p' | 'mq135' | 'mq3';

type MetricSeriesMap = Record<MetricKey, TimePoint[]>;

type LiveValues = Partial<Record<MetricKey, number>> & {
    deviceId?: number | string;
    ts?: number;
};

type WsPayload = {
    ts?: string;
    deviceId?: number | string;
    aht_t?: number | null;
    aht_h?: number | null;
    bmp_t?: number | null;
    bmp_p?: number | null;
    mq135?: number | null;
    mq3?: number | null;
};

const METRIC_KEYS: MetricKey[] = [
    'aht_t',
    'aht_h',
    'bmp_t',
    'bmp_p',
    'mq135',
    'mq3',
];

const MAX_RANGE_MS = 12 * 60 * 60 * 1000;

const createEmptySeries = (): MetricSeriesMap => ({
    aht_t: [],
    aht_h: [],
    bmp_t: [],
    bmp_p: [],
    mq135: [],
    mq3: [],
});

function clampSeries(series: MetricSeriesMap, now: number): MetricSeriesMap {
    const cutoff = now - MAX_RANGE_MS;
    const next: MetricSeriesMap = createEmptySeries();

    for (const key of METRIC_KEYS) {
        next[key] = series[key].filter((p) => p.ts >= cutoff);
    }

    return next;
}

export const App: React.FC = () => {
    const [series, setSeries] = useState<MetricSeriesMap>(() => createEmptySeries());
    const [live, setLive] = useState<LiveValues>({});
    const [timeRangeId, setTimeRangeId] = useState<TimeRangeId>('15m');

    // WebSocket for live data
    useEffect(() => {
        const wsUrl =
            (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:4000/ws';

        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            try {
                const payload: WsPayload = JSON.parse(event.data);
                const ts = payload.ts ? new Date(payload.ts).getTime() : Date.now();

                setSeries((prev) => {
                    const updated: MetricSeriesMap = {
                        aht_t: [...prev.aht_t],
                        aht_h: [...prev.aht_h],
                        bmp_t: [...prev.bmp_t],
                        bmp_p: [...prev.bmp_p],
                        mq135: [...prev.mq135],
                        mq3: [...prev.mq3],
                    };

                    const addPoint = (key: MetricKey, value: number | null | undefined) => {
                        if (typeof value === 'number' && !Number.isNaN(value)) {
                            updated[key].push({ ts, value });
                        }
                    };

                    addPoint('aht_t', payload.aht_t);
                    addPoint('aht_h', payload.aht_h);
                    addPoint('bmp_t', payload.bmp_t);
                    addPoint('bmp_p', payload.bmp_p);
                    addPoint('mq135', payload.mq135);
                    addPoint('mq3', payload.mq3);

                    return clampSeries(updated, ts);
                });

                setLive((prev) => ({
                    ...prev,
                    ts,
                    deviceId: payload.deviceId ?? prev.deviceId,
                    ...(typeof payload.aht_t === 'number' && { aht_t: payload.aht_t }),
                    ...(typeof payload.aht_h === 'number' && { aht_h: payload.aht_h }),
                    ...(typeof payload.bmp_t === 'number' && { bmp_t: payload.bmp_t }),
                    ...(typeof payload.bmp_p === 'number' && { bmp_p: payload.bmp_p }),
                    ...(typeof payload.mq135 === 'number' && { mq135: payload.mq135 }),
                    ...(typeof payload.mq3 === 'number' && { mq3: payload.mq3 }),
                }));
            } catch (err) {
                // ignore malformed messages
                console.error('[WS] parse error', err);
            }
        };

        ws.onerror = (err) => {
            console.error('[WS] error', err);
        };

        return () => ws.close();
    }, []);

    const selectedRange = useMemo(
        () => TIME_RANGES.find((r) => r.id === timeRangeId)!,
        [timeRangeId]
    );

    // Filter series by selected time range
    const rangedSeries = useMemo(() => {
        const now = Date.now();
        const cutoff = now - selectedRange.minutes * 60 * 1000;

        const pick = (key: MetricKey): TimePoint[] =>
            series[key].filter((p) => p.ts >= cutoff);

        return {
            aht_t: pick('aht_t'),
            aht_h: pick('aht_h'),
            bmp_t: pick('bmp_t'),
            bmp_p: pick('bmp_p'),
            mq135: pick('mq135'),
            mq3: pick('mq3'),
        };
    }, [series, selectedRange]);

    const deviceIdLabel =
        live.deviceId !== undefined ? String(live.deviceId) : '—';

    const lastTimeLabel =
        live.ts !== undefined
            ? new Date(live.ts).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            : '—';

    const buildSeries = (
        key: MetricKey,
        label: string,
    ): ChartSeries => ({
        id: key,
        label,
        points: rangedSeries[key],
    });

    const ahtSeries: ChartSeries[] = [
        buildSeries('aht_t', 'Temperature'),
        buildSeries('aht_h', 'Humidity'),
    ];

    const bmpTempSeries: ChartSeries[] = [buildSeries('bmp_t', 'Temperature')];

    const bmpPressureSeries: ChartSeries[] = [buildSeries('bmp_p', 'Pressure')];

    const mq135Series: ChartSeries[] = [buildSeries('mq135', 'MQ135 raw')];

    const mq3Series: ChartSeries[] = [buildSeries('mq3', 'MQ3 raw')];

    return (
        <div className="app-root">
            <header className="app-header">
                <div>
                    <h1 className="app-title">Meteo Station</h1>
                    <p className="app-subtitle">
                        Live data from NodeMCU sensors · Device ID:&nbsp;
                        <span className="app-subtitle-strong">{deviceIdLabel}</span>
                    </p>
                </div>

                <div className="app-header-right">
                    <div className="app-header-meta">
                        <span className="label">Range</span>
                        <TimeRangeSelector
                            value={timeRangeId}
                            onChange={setTimeRangeId}
                        />
                    </div>
                    <div className="app-header-meta">
                        <span className="label">Last update</span>
                        <span className="value">{lastTimeLabel}</span>
                    </div>
                </div>
            </header>

            <main className="app-main">
                <ChartCard
                    title="AHT10: Temperature & Humidity"
                    yLabel="°C / %"
                    unitLabel="°C / %"
                    lastUpdatedLabel={lastTimeLabel}
                    series={ahtSeries}
                    primarySeriesId="aht_t"
                />

                <ChartCard
                    title="BMP280: Temperature"
                    yLabel="°C"
                    unitLabel="°C"
                    lastUpdatedLabel={lastTimeLabel}
                    series={bmpTempSeries}
                    primarySeriesId="bmp_t"
                />

                <ChartCard
                    title="BMP280: Pressure"
                    yLabel="mmHg"
                    unitLabel="mmHg"
                    lastUpdatedLabel={lastTimeLabel}
                    series={bmpPressureSeries}
                    primarySeriesId="bmp_p"
                />

                <ChartCard
                    title="MQ135 raw"
                    yLabel="ADC value"
                    unitLabel="ADC"
                    lastUpdatedLabel={lastTimeLabel}
                    series={mq135Series}
                    primarySeriesId="mq135"
                />

                <ChartCard
                    title="MQ3 raw"
                    yLabel="ADC value"
                    unitLabel="ADC"
                    lastUpdatedLabel={lastTimeLabel}
                    series={mq3Series}
                    primarySeriesId="mq3"
                />
            </main>
        </div>
    );
};

export default App;