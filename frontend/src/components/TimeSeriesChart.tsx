import React, { useMemo, useRef, useState } from 'react';
import { downsampleSeries } from '../helpers/timeseries';
import { TimeSeriesChartProps, ChartSeries, TimePoint } from '../types';

const SVG_WIDTH = 800;
const SVG_HEIGHT_DEFAULT = 220;
const PADDING_LEFT = 60;
const PADDING_RIGHT = 10;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 30;

const DEFAULT_COLORS = ['#111827', '#2563eb', '#10b981', '#f59e0b'];

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
    series,
    height = SVG_HEIGHT_DEFAULT,
    showBaselineForId,
    onHoverChange,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [hoverTs, setHoverTs] = useState<number | null>(null);

    const prepared = useMemo(() => {
        const dsSeries: ChartSeries[] = series.map((s) => ({
            ...s,
            points: downsampleSeries(s.points),
        }));

        const allPoints = dsSeries.flatMap((s) => s.points);

        if (!allPoints.length) {
            return {
                hasData: false,
                dsSeries,
                minTs: 0,
                maxTs: 0,
                minVal: 0,
                maxVal: 0,
                baseline: null as number | null,
            };
        }

        let minTs = allPoints[0].ts;
        let maxTs = allPoints[0].ts;
        let minVal = allPoints[0].value;
        let maxVal = allPoints[0].value;

        for (const p of allPoints) {
            if (p.ts < minTs) minTs = p.ts;
            if (p.ts > maxTs) maxTs = p.ts;
            if (p.value < minVal) minVal = p.value;
            if (p.value > maxVal) maxVal = p.value;
        }

        if (minVal === maxVal) {
            const delta = Math.abs(minVal) < 0.1 ? 1 : Math.abs(minVal) * 0.1;
            minVal -= delta;
            maxVal += delta;
        }

        let baseline: number | null = null;
        if (showBaselineForId) {
            const s = dsSeries.find((x) => x.id === showBaselineForId);
            if (s && s.points.length) {
                const sum = s.points.reduce((acc, p) => acc + p.value, 0);
                baseline = sum / s.points.length;
            }
        }

        return {
            hasData: true,
            dsSeries,
            minTs,
            maxTs,
            minVal,
            maxVal,
            baseline,
        };
    }, [series, showBaselineForId]);

    if (!prepared.hasData) {
        return (
            <div className="chart-empty">
                <span>No data in selected range</span>
            </div>
        );
    }

    const { dsSeries, minTs, maxTs, minVal, maxVal, baseline } = prepared;

    const w = SVG_WIDTH;
    const h = height;
    const innerW = w - PADDING_LEFT - PADDING_RIGHT;
    const innerH = h - PADDING_TOP - PADDING_BOTTOM;
    const tsRange = maxTs - minTs || 1;
    const valRange = maxVal - minVal || 1;

    const xScale = (ts: number) =>
        PADDING_LEFT + ((ts - minTs) / tsRange) * innerW;

    const yScale = (v: number) =>
        PADDING_TOP + (1 - (v - minVal) / valRange) * innerH;

    const xTicks = 6;
    const xTickValues: number[] = [];
    for (let i = 0; i <= xTicks; i++) {
        xTickValues.push(minTs + (tsRange * i) / xTicks);
    }

    const yTicks = 4;
    const yTickValues: number[] = [];
    for (let i = 0; i <= yTicks; i++) {
        yTickValues.push(minVal + (valRange * i) / yTicks);
    }

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatValue = (v: number) => v.toFixed(1);

    const findClosest = (points: TimePoint[], targetTs: number): TimePoint | null => {
        if (!points.length) return null;
        let best = points[0];
        let bestDiff = Math.abs(best.ts - targetTs);
        for (const p of points) {
            const diff = Math.abs(p.ts - targetTs);
            if (diff < bestDiff) {
                best = p;
                bestDiff = diff;
            }
        }
        return best;
    };

    const handleMouseMove: React.MouseEventHandler<SVGRectElement> = (e) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const relativeX =
            ((e.clientX - rect.left) / rect.width) * w - PADDING_LEFT;

        if (relativeX < 0 || relativeX > innerW) {
            setHoverTs(null);
            onHoverChange?.(null);
            return;
        }

        const ratio = relativeX / innerW;
        const targetTs = minTs + tsRange * ratio;

        const payloadValues: Record<string, number | null> = {};
        let primaryTs: number | null = null;

        for (const s of dsSeries) {
            const closest = findClosest(s.points, targetTs);
            if (closest) {
                payloadValues[s.id] = closest.value;
                if (primaryTs === null) {
                    primaryTs = closest.ts;
                }
            } else {
                payloadValues[s.id] = null;
            }
        }

        if (primaryTs === null) {
            setHoverTs(null);
            onHoverChange?.(null);
            return;
        }

        setHoverTs(primaryTs);
        onHoverChange?.({
            ts: primaryTs,
            values: payloadValues,
        });
    };

    const handleMouseLeave = () => {
        setHoverTs(null);
        onHoverChange?.(null);
    };

    const hoverX = hoverTs !== null ? xScale(hoverTs) : null;

    return (
        <div className="chart-container" ref={containerRef}>
            <svg
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="none"
                className="chart-svg"
            >
                {/* Axes */}
                <line
                    x1={PADDING_LEFT}
                    y1={PADDING_TOP}
                    x2={PADDING_LEFT}
                    y2={PADDING_TOP + innerH}
                    stroke="#dde1ea"
                    strokeWidth={1}
                />
                <line
                    x1={PADDING_LEFT}
                    y1={PADDING_TOP + innerH}
                    x2={PADDING_LEFT + innerW}
                    y2={PADDING_TOP + innerH}
                    stroke="#dde1ea"
                    strokeWidth={1}
                />

                {/* Y grid and labels */}
                {yTickValues.map((v, idx) => {
                    const y = yScale(v);
                    return (
                        <g key={idx}>
                            <line
                                x1={PADDING_LEFT}
                                y1={y}
                                x2={PADDING_LEFT + innerW}
                                y2={y}
                                stroke="#f2f4f8"
                                strokeWidth={1}
                            />
                            <text
                                x={PADDING_LEFT - 8}
                                y={y + 4}
                                textAnchor="end"
                                className="chart-axis-label"
                            >
                                {formatValue(v)}
                            </text>
                        </g>
                    );
                })}

                {/* X grid and labels */}
                {xTickValues.map((ts, idx) => {
                    const x = xScale(ts);
                    return (
                        <g key={idx}>
                            <line
                                x1={x}
                                y1={PADDING_TOP}
                                x2={x}
                                y2={PADDING_TOP + innerH}
                                stroke="#f2f4f8"
                                strokeWidth={1}
                            />
                            <text
                                x={x}
                                y={PADDING_TOP + innerH + 18}
                                textAnchor="middle"
                                className="chart-axis-label"
                            >
                                {formatTime(ts)}
                            </text>
                        </g>
                    );
                })}

                {/* Baseline */}
                {baseline !== null && (
                    <line
                        x1={PADDING_LEFT}
                        y1={yScale(baseline)}
                        x2={PADDING_LEFT + innerW}
                        y2={yScale(baseline)}
                        stroke="#ff9758"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                    />
                )}

                {/* Series lines */}
                {dsSeries.map((s, idx) => {
                    if (!s.points.length) return null;
                    const path = s.points
                        .map((p, i) => {
                            const x = xScale(p.ts);
                            const y = yScale(p.value);
                            return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                        })
                        .join(' ');

                    const strokeColor = s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length];

                    return (
                        <path
                            key={s.id}
                            d={path}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={1.5}
                        />
                    );
                })}

                {/* Hover line and points */}
                {hoverX !== null && (
                    <g>
                        <line
                            x1={hoverX}
                            y1={PADDING_TOP}
                            x2={hoverX}
                            y2={PADDING_TOP + innerH}
                            stroke="#9ca3af"
                            strokeDasharray="4 4"
                            strokeWidth={1}
                        />
                        {dsSeries.map((s, idx) => {
                            const closest = hoverTs
                                ? findClosest(s.points, hoverTs)
                                : null;
                            if (!closest) return null;
                            const cx = xScale(closest.ts);
                            const cy = yScale(closest.value);
                            const fillColor = s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
                            return (
                                <circle
                                    key={s.id}
                                    cx={cx}
                                    cy={cy}
                                    r={3}
                                    fill={fillColor}
                                    stroke="#ffffff"
                                    strokeWidth={1}
                                />
                            );
                        })}
                    </g>
                )}

                {/* Hover layer */}
                <rect
                    x={PADDING_LEFT}
                    y={PADDING_TOP}
                    width={innerW}
                    height={innerH}
                    fill="transparent"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                />
            </svg>
        </div>
    );
};