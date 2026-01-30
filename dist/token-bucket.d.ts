/**
 * Token Bucket Rate Limiter
 * Enforces maximum throughput (e.g., 500 tx per 3 seconds)
 * with continuous refill and burst support
 */
export declare class TokenBucket {
    private readonly capacity;
    private readonly refillPerMs;
    private tokens;
    private lastRefillMs;
    constructor(capacity: number, // Max tokens (e.g., 500)
    refillPerMs: number);
    private refill;
    /**
     * Take n tokens, blocking until available
     */
    take(n?: number): Promise<void>;
    /**
     * Check available tokens without consuming
     */
    available(): number;
    /**
     * Reset bucket to full capacity
     */
    reset(): void;
}
//# sourceMappingURL=token-bucket.d.ts.map