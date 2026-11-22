import { callLocalAI } from './localAi';

export type AIProvider = 'local';

export type StepType = 'transcript' | 'duration' | 'prompt';

export async function callWithRetry(prompt: string, _provider?: AIProvider, _temperature?: number, _maxRetries?: number, _step?: StepType): Promise<string> {
    return callLocalAI(prompt);
}

/**
 * Run async operations with a concurrency limit.
 */
export async function runWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    const execute = async () => {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await fn(items[currentIndex], currentIndex);
        }
    };

    const workers = Array.from({ length: Math.min(limit, items.length) }, execute);
    await Promise.all(workers);
    return results;
}
