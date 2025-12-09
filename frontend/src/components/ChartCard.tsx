import React, { useMemo, useState } from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';
import { computeStats, formatNumber } from '../helpers/timeseries';
import { ChartCardProps, HoverPayload, TimePoint, ChartSeries } from '../types';

export const ChartCard: React.FC<ChartCardProps> = ({
    title,
    yLabel,
    unitLabel,
    lastUpdatedLabel,
    series,
    primarySeriesId,
}) => {
    const [hover, setHover] = useState<HoverPayload | null>(null);

    const primarySeries = series.find((s) => s.id === primarySeriesId) ?? series[0];

    const stats = useMemo(() => {
        if (!primarySeries) return null;
        return computeStats(primarySeries.points);
    }, [primarySeries]);

    const hoverTimeLabel =
        hover && hover.ts
            ? new Date(hover.ts).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            : null;

    const seriesInfo = useMemo(
        () =>
            series.map((s: ChartSeries, idx: number) => {
                const pts = s.points;
                const lastPoint: TimePoint | null =
                    pts && pts.length ? pts[pts.length - 1] : null;

                const lastValue = lastPoint ? lastPoint.value : null;
                const lastTs = lastPoint ? lastPoint.ts : null;

                const hoverVal = hover?.values?.[s.id];
                const currentValue =
                    typeof hoverVal === 'number' ? hoverVal : lastValue;
                const currentTs =
                    typeof hoverVal === 'number' && hover?.ts
                        ? hover.ts
                        : lastTs;

                const fallbackColor = idx === 0 ? '#111827' : '#2563eb';

                return {
                    id: s.id,
                    label: s.label,
                    unit: s.unit,
                    color: s.color ?? fallbackColor,
                    lastValue,
                    lastTs,
                    currentValue,
                    currentTs,
                };
            }),
        [series, hover],
    );

    return (
        <section className="card">
            <div className="card-header">
                <div>
                    <h2 className="card-title">{title}</h2>
                    <div className="card-subtitle">
                        <span>Y: {yLabel}</span>
                        {unitLabel && (
                            <span className="card-subtitle-muted"> · {unitLabel}</span>
                        )}
                        {lastUpdatedLabel && (
                            <span className="card-subtitle-muted">
                                {' '}
                                · Last: {lastUpdatedLabel}
                            </span>
                        )}
                    </div>
                </div>

                <div className="card-header-right">
                    <div className="card-header-values">
                        {seriesInfo.map((s) => (
                            <div className="card-header-row" key={s.id}>
                                <span
                                    className="dot"
                                    style={{ backgroundColor: s.color }}
                                />
                                <span className="card-header-label">{s.label}</span>
                                <span className="card-header-label">Last</span>
                                <span className="card-header-value">
                                    {formatNumber(s.lastValue)} {s.unit ?? ''}
                                </span>
                                <span className="card-header-label">Current</span>
                                <span className="card-header-value">
                                    {formatNumber(
                                        typeof s.currentValue === 'number'
                                            ? s.currentValue
                                            : null,
                                    )}{' '}
                                    {s.unit ?? ''}
                                </span>
                                {hoverTimeLabel && s.currentTs === hover?.ts && (
                                    <span className="card-header-time">
                                        ({hoverTimeLabel})
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {stats && (
                        <div className="card-stats">
                            <span>min {formatNumber(stats.min)}</span>
                            <span>avg {formatNumber(stats.avg)}</span>
                            <span>max {formatNumber(stats.max)}</span>
                        </div>
                    )}
                </div>
            </div>

            <TimeSeriesChart
                series={series}
                showBaselineForId={primarySeriesId}
                onHoverChange={setHover}
            />
        </section>
    );
};