import { useEffect, useRef, useState } from "react"

export function useElementSize<T extends HTMLElement>() {
    const ref = useRef<T | null>(null)
    const [width, setWidth] = useState<number>(800)

    useEffect(() => {
        const el = ref.current
        if (!el) return

        const update = () => {
            setWidth(el.clientWidth || 800)
        }

        update()

        const observer = new ResizeObserver(() => {
            update()
        })

        observer.observe(el)

        return () => {
            observer.disconnect()
        }
    }, [])

    return { ref, width }
}