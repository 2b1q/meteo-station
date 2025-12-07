export interface MeteoReading {
    deviceId: number | string
    bmp_t: number | null
    bmp_p: number | null
    bmp_qnh: number | null
    aht_t: number | null
    aht_h: number | null
    mq135: number | null
    mq3: number | null
    ts: string // ISO timestamp
}