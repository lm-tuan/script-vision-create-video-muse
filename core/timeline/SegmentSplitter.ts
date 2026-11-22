/**
 * SegmentSplitter divides a scene's immutable duration into sub-segments (shots)
 * with integer millisecond precision, ensuring exact boundaries with zero gaps or overlaps.
 */
export class SegmentSplitter {
    /**
     * Splits a time range [startMs, endMs] into a specified number of segments.
     * Distributes any remainders evenly among the initial segments to preserve exact total duration.
     */
    static splitRange(startMs: number, endMs: number, segmentCount: number): Array<{ startMs: number; endMs: number; durationMs: number }> {
        if (segmentCount <= 0) return [];
        
        const totalDurationMs = endMs - startMs;
        if (totalDurationMs <= 0) {
            // Fallback for zero or negative duration
            return Array.from({ length: segmentCount }, (_, idx) => ({
                startMs,
                endMs,
                durationMs: 0
            }));
        }

        const baseDurationMs = Math.floor(totalDurationMs / segmentCount);
        const remainder = totalDurationMs % segmentCount;
        
        const segments: Array<{ startMs: number; endMs: number; durationMs: number }> = [];
        let currentStartMs = startMs;

        for (let i = 0; i < segmentCount; i++) {
            const isLast = i === segmentCount - 1;
            // Distribute the remainder (1ms each) to the first few segments
            const segmentDurationMs = baseDurationMs + (i < remainder ? 1 : 0);
            const segmentEndMs = isLast ? endMs : currentStartMs + segmentDurationMs;

            segments.push({
                startMs: currentStartMs,
                endMs: segmentEndMs,
                durationMs: segmentEndMs - currentStartMs
            });

            currentStartMs = segmentEndMs;
        }

        return segments;
    }
}
