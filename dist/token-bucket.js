"use strict";
/**
 * Token Bucket Rate Limiter
 * Enforces maximum throughput (e.g., 500 tx per 3 seconds)
 * with continuous refill and burst support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBucket = void 0;
class TokenBucket {
    constructor(capacity, // Max tokens (e.g., 500)
    refillPerMs // Refill rate (e.g., 500/3000)
    ) {
        this.capacity = capacity;
        this.refillPerMs = refillPerMs;
        this.tokens = capacity;
        this.lastRefillMs = Date.now();
    }
    refill(now = Date.now()) {
        const elapsed = now - this.lastRefillMs;
        if (elapsed <= 0)
            return;
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
        this.lastRefillMs = now;
    }
    /**
     * Take n tokens, blocking until available
     */
    async take(n = 1) {
        while (true) {
            const now = Date.now();
            this.refill(now);
            if (this.tokens >= n) {
                this.tokens -= n;
                return;
            }
            // Calculate wait time for missing tokens
            const missing = n - this.tokens;
            const waitMs = Math.ceil(missing / this.refillPerMs);
            // Short sleeps for responsiveness
            await new Promise(r => setTimeout(r, Math.min(waitMs, 250)));
        }
    }
    /**
     * Check available tokens without consuming
     */
    available() {
        this.refill();
        return Math.floor(this.tokens);
    }
    /**
     * Reset bucket to full capacity
     */
    reset() {
        this.tokens = this.capacity;
        this.lastRefillMs = Date.now();
    }
}
exports.TokenBucket = TokenBucket;
//# sourceMappingURL=token-bucket.js.map