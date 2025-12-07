import React from 'react';

export type TimeRangeId =
    | '10m'
    | '15m'
    | '30m'
    | '1h'
    | '2h'
    | '3h'
    | '6h'
    | '12h';

export type TimeRangeOption = {
    id: TimeRangeId;
    label: string;
    minutes: number;
};

export const TIME_RANGES: TimeRangeOption[] = [
    { id: '10m', label: '10 min', minutes: 10 },
    { id: '15m', label: '15 min', minutes: 15 },
    { id: '30m', label: '30 min', minutes: 30 },
    { id: '1h', label: '1 h', minutes: 60 },
    { id: '2h', label: '2 h', minutes: 120 },
    { id: '3h', label: '3 h', minutes: 180 },
    { id: '6h', label: '6 h', minutes: 360 },
    { id: '12h', label: '12 h', minutes: 720 },
];

type Props = {
    value: TimeRangeId;
    onChange: (value: TimeRangeId) => void;
};

export const TimeRangeSelector: React.FC<Props> = ({ value, onChange }) => {
    return (
        <div className="time-range-selector">
            {TIME_RANGES.map((r) => (
                <button
                    key={r.id}
                    type="button"
                    className={
                        r.id === value
                            ? 'time-range-btn time-range-btn--active'
                            : 'time-range-btn'
                    }
                    onClick={() => onChange(r.id)}
                >
                    {r.label}
                </button>
            ))}
        </div>
    );
};