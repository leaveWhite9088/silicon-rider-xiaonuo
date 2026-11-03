/**
 * Pathfinder
 * Implements shortest path algorithms for route calculation
 */
import { Node, Edge, CalculateDistanceResponse, EstimateTimeResponse } from '../types/index.js';
import { CongestionManager } from './congestion-manager.js';
/**
 * Pathfinder class for calculating routes and distances
 */
export declare class Pathfinder {
    private nodes;
    private adjacency;
    constructor(nodes: Map<string, Node>, edges: Edge[]);
    /**
     * Build adjacency list for efficient pathfinding
     * Treats edges as bidirectional
     */
    private buildAdjacencyList;
    /**
     * Calculate shortest path distance between two nodes using Dijkstra's algorithm
     * 需求 11.1: 返回最短路径距离和路径节点列表
     */
    calculateDistance(fromId: string, toId: string): CalculateDistanceResponse | null;
    /**
     * Estimate travel time considering current congestion
     * 需求 11.2, 11.3: 返回估计总时间和每段详细信息
     */
    estimateTime(locationIds: string[], currentTime: number, congestionManager: CongestionManager): EstimateTimeResponse | null;
    /**
     * Get average congestion along a path
     */
    private getAverageCongestion;
    /**
     * Get edge between two nodes (if exists)
     */
    getEdge(fromId: string, toId: string): Edge | null;
    /**
     * Check if a path exists between two nodes
     */
    hasPath(fromId: string, toId: string): boolean;
}
//# sourceMappingURL=pathfinder.d.ts.map