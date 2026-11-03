/**
 * Congestion Manager
 * Manages dynamic congestion levels based on time of day
 */
import { Edge, Node } from '../types/index.js';
/**
 * Congestion level enum
 */
export declare enum CongestionLevel {
    NORMAL = 0,// < 0.3
    LIGHT = 1,// 0.3 - 0.5
    MODERATE = 2,// 0.5 - 0.7
    HEAVY = 3
}
/**
 * Congestion Manager class
 */
export declare class CongestionManager {
    private edges;
    private nodes;
    private mapCenter;
    private mapRadius;
    constructor(edges: Edge[], nodes: Map<string, Node>);
    /**
     * Calculate the center of the map
     */
    private calculateMapCenter;
    /**
     * Calculate the radius of the map (max distance from center)
     */
    private calculateMapRadius;
    /**
     * Calculate distance from map center for a position
     */
    private distanceFromCenter;
    /**
     * Check if an edge is at the map edge (outer area)
     */
    private isAtMapEdge;
    /**
     * Check if an edge is at the map center
     */
    private isAtMapCenter;
    /**
     * Update congestion levels based on current game time
     * Returns a map of edge ID to congestion level
     */
    updateCongestion(currentTime: number): Map<string, number>;
    /**
     * Get congestion level for a specific edge at a given time
     */
    getCongestion(edge: Edge, currentTime: number): number;
    /**
     * Map congestion value to speed (km/h)
     * 需求 2.4-2.7:
     * - Normal (< 0.3): 30 km/h
     * - Light (0.3-0.5): 25 km/h
     * - Moderate (0.5-0.7): 20 km/h
     * - Heavy (>= 0.7): 15 km/h
     */
    static congestionToSpeed(congestion: number): number;
    /**
     * Get congestion level category
     */
    static getCongestionLevel(congestion: number): CongestionLevel;
    /**
     * Get congestion level name
     */
    static getCongestionLevelName(congestion: number): string;
    /**
     * Generate edge ID for map lookup
     */
    private getEdgeId;
}
//# sourceMappingURL=congestion-manager.d.ts.map