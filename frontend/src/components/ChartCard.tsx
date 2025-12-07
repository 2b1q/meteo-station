import React, { useMemo, useState } from 'react';
import { ChartSeries, HoverPayload, TimeSeriesChart } from './TimeSeriesChart';
import {
    TimePoint,
    computeStats,
    formatNumber,
} from '../helpers/timeseries';

type Props = {
    title: string;
    yLabel: string;
    unitLabel?: string;
    lastUpdatedLabel?: string;
    series: ChartSeries[];
    primarySeriesId: string;
};

export const ChartCard: React.FC<Props> = ({
    title,
    yLabel,
    unitLabel,
    lastUpdatedLabel,
    series,
    primarySeriesId,
}) => {
    const [hover, setHover] = useState<HoverPayload | null>(null);

    const primarySeries = series.find((s) => s.id === primarySeriesId);

    const stats = useMemo(() => {
        if (!primarySeries) return null;
        return computeStats(primarySeries.points);
    }, [primarySeries]);

    const lastPoint: TimePoint | null =
        primarySeries && primarySeries.points.length
            ? primarySeries.points[primarySeries.points.length - 1]
            : null;

    const lastValue = lastPoint ? lastPoint.value : null;
    const currentValue =
        hover && hover.values[primarySeriesId] !== undefined
            ? hover.values[primarySeriesId]
            : lastValue;

    const hoverTimeLabel =
        hover && hover.ts
            ? new Date(hover.ts).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            : null;

    const lastTimeLabel =
        lastPoint && lastPoint.ts
            ? new Date(lastPoint.ts).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            : null;

    return (
        <section className="card">
            <div className="card-header">
                <div>
                    <h2 className="card-title">{title}</h2>
                    <div className="card-subtitle">
                        <span>Y: {yLabel}</span>
                        {unitLabel && <span className="card-subtitle-muted"> · {unitLabel}</span>}
                        {lastUpdatedLabel && (
                            <span className="card-subtitle-muted"> · Last: {lastUpdatedLabel}</span>
                        )}
                    </div>
                </div>

                <div className="card-header-right">
                    <div className="card-header-values">
                        <div className="card-header-row">
                            <span className="dot dot--primary" />
                            <span className="card-header-label">Last</span>
                            <span className="card-header-value">
                                {formatNumber(lastValue)}{' '}
                                {unitLabel ? unitLabel.replace(/^.*\s/, '') : ''}
                            </span>
                            {lastTimeLabel && (
                                <span className="card-header-time">({lastTimeLabel})</span>
                            )}
                        </div>
                        <div className="card-header-row">
                            <span className="dot dot--secondary" />
                            <span className="card-header-label">Current</span>
                            <span className="card-header-value">
                                {formatNumber(
                                    typeof currentValue === 'number' ? currentValue : null
                                )}{' '}
                                {unitLabel ? unitLabel.replace(/^.*\s/, '') : ''}
                            </span>
                            {hoverTimeLabel && (
                                <span className="card-header-time">({hoverTimeLabel})</span>
                            )}
                        </div>
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