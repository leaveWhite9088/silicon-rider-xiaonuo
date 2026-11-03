/**
 * Seeded Random Number Generator using Mulberry32 algorithm
 * Provides deterministic random number generation for reproducible map generation
 */
export declare class SeededRNG {
    private state;
    constructor(seed: number);
    /**
     * Generate next random number using Mulberry32 algorithm
     * Returns a value between 0 (inclusive) and 1 (exclusive)
     */
    nextFloat(): number;
    /**
     * Generate random integer in range [min, max] (inclusive)
     */
    nextInt(min: number, max: number): number;
    /**
     * Generate random float in range [min, max)
     */
    nextFloatRange(min: number, max: number): number;
    /**
     * Shuffle array in place using Fisher-Yates algorithm
     * Returns the shuffled array
     */
    shuffle<T>(array: T[]): T[];
    /**
     * Generate random boolean with given probability
     * @param probability - probability of returning true (0-1)
     */
    nextBoolean(probability?: number): boolean;
    /**
     * Pick random element from array
     */
    choice<T>(array: T[]): T;
}
//# sourceMappingURL=seeded-rng.d.ts.map