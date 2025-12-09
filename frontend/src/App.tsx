import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { TimeRangeId, TIME_RANGES, TimeRangeSelector } from './components/TimeRangeSelector';
import { ChartCard } from './components/ChartCard';
import { MetricKey, MetricSeriesMap, LiveValues, WsPayload, HistoryResponse, TimePoint, ChartSeries, } from './types';

const METRIC_KEYS: MetricKey[] = [
    'aht_t',
    'aht_h',
    'bmp_t',
    'bmp_p',
    'mq135',
    'mq3',
];

const MAX_RANGE_MS = 12 * 60 * 60 * 1000;

const COLOR_PRIMARY = '#111827';
const COLOR_SECONDARY = '#2563eb';

const createEmptySeries = (): MetricSeriesMap => ({
    aht_t: [],
    aht_h: [],
    bmp_t: [],
    bmp_p: [],
    mq135: [],
    mq3: [],
});

const DEFAULT_API_BASE = 'http://localhost:4000';
const apiBase = import.meta.env?.VITE_API_URL || DEFAULT_API_BASE;
const wsUrl = import.meta.env?.VITE_WS_URL || 'ws://localhost:4000/ws';

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
                console.error('[WS] parse error', err);
            }
        };

        ws.onerror = (err) => {
            console.error('[WS] error', err);
        };

        return () => ws.close();
    }, [wsUrl]);

    const selectedRange = useMemo(
        () => TIME_RANGES.find((r) => r.id === timeRangeId)!,
        [timeRangeId],
    );

    // Load historical data from backend when range changes
    useEffect(() => {
        const controller = new AbortController();

        async function loadHistory() {
            const params = new URLSearchParams({
                minutes: String(selectedRange.minutes),
            });

            const res = await fetch(`${apiBase}/api/history?${params.toString()}`, {
                signal: controller.signal,
            });

            if (!res.ok) {
                console.error('[HTTP] history error', res.status);
                return;
            }

            const data: HistoryResponse = await res.json();

            const nextSeries: MetricSeriesMap = {
                aht_t: data.points.aht_t ?? [],
                aht_h: data.points.aht_h ?? [],
                bmp_t: data.points.bmp_t ?? [],
                bmp_p: data.points.bmp_p ?? [],
                mq135: data.points.mq135 ?? [],
                mq3: data.points.mq3 ?? [],
            };

            setSeries(nextSeries);

            const allPoints: TimePoint[] = Object.values(nextSeries).flat();
            const latestTs =
                allPoints.length > 0
                    ? allPoints.reduce(
                        (max, p) => (p.ts > max ? p.ts : max),
                        allPoints[0].ts,
                    )
                    : undefined;

            setLive((prev) => ({
                ...prev,
                deviceId: prev.deviceId ?? (data.deviceId ?? undefined),
                ts: prev.ts ?? latestTs ?? prev.ts,
            }));
        }

        loadHistory().catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('[HTTP] history fetch failed', err);
        });

        return () => controller.abort();
    }, [apiBase, selectedRange.minutes]);

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

    const buildSeries = (key: MetricKey, label: string, unit: string, color: string,): ChartSeries => ({
        id: key,
        label,
        unit,
        color,
        points: rangedSeries[key],
    });

    const ahtSeries: ChartSeries[] = [
        buildSeries('aht_t', 'Temperature', '°C', COLOR_PRIMARY),
        buildSeries('aht_h', 'Humidity', '%', COLOR_SECONDARY),
    ];

    const bmpTempSeries: ChartSeries[] = [
        buildSeries('bmp_t', 'Temperature', '°C', COLOR_PRIMARY),
    ];

    const bmpPressureSeries: ChartSeries[] = [
        buildSeries('bmp_p', 'Pressure', 'mmHg', COLOR_PRIMARY),
    ];

    const mq135Series: ChartSeries[] = [
        buildSeries('mq135', 'MQ135 raw', 'ADC', COLOR_PRIMARY),
    ];

    const mq3Series: ChartSeries[] = [
        buildSeries('mq3', 'MQ3 raw', 'ADC', COLOR_PRIMARY),
    ];

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