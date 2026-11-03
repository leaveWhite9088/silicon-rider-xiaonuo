/**
 * Pathfinder
 * Implements shortest path algorithms for route calculation
 */
import { CongestionManager } from './congestion-manager.js';
/**
 * Pathfinder class for calculating routes and distances
 */
export class Pathfinder {
    nodes;
    // private edges: Edge[];
    adjacency;
    constructor(nodes, edges) {
        this.nodes = nodes;
        // this.edges = edges;
        this.adjacency = this.buildAdjacencyList(edges);
    }
    /**
     * Build adjacency list for efficient pathfinding
     * Treats edges as bidirectional
     */
    buildAdjacencyList(edges) {
        const adjacency = new Map();
        // Initialize adjacency list for all nodes
        for (const nodeId of this.nodes.keys()) {
            adjacency.set(nodeId, new Map());
        }
        // Add edges (bidirectional)
        for (const edge of edges) {
            adjacency.get(edge.from).set(edge.to, edge);
            adjacency.get(edge.to).set(edge.from, {
                ...edge,
                from: edge.to,
                to: edge.from,
            });
        }
        return adjacency;
    }
    /**
     * Calculate shortest path distance between two nodes using Dijkstra's algorithm
     * 需求 11.1: 返回最短路径距离和路径节点列表
     */
    calculateDistance(fromId, toId) {
        // Validate node IDs
        if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
            return null;
        }
        // Same node
        if (fromId === toId) {
            return {
                distance: 0,
                path: [fromId],
            };
        }
        // Dijkstra's algorithm
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set(this.nodes.keys());
        // Initialize distances
        for (const nodeId of this.nodes.keys()) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
        }
        distances.set(fromId, 0);
        while (unvisited.size > 0) {
            // Find unvisited node with minimum distance
            let currentNode = null;
            let minDistance = Infinity;
            for (const nodeId of unvisited) {
                const distance = distances.get(nodeId);
                if (distance < minDistance) {
                    minDistance = distance;
                    currentNode = nodeId;
                }
            }
            // No path exists
            if (currentNode === null || minDistance === Infinity) {
                return null;
            }
            // Found destination
            if (currentNode === toId) {
                break;
            }
            unvisited.delete(currentNode);
            // Update distances to neighbors
            const neighbors = this.adjacency.get(currentNode);
            for (const [neighborId, edge] of neighbors) {
                if (unvisited.has(neighborId)) {
                    const newDistance = distances.get(currentNode) + edge.distance;
                    if (newDistance < distances.get(neighborId)) {
                        distances.set(neighborId, newDistance);
                        previous.set(neighborId, currentNode);
                    }
                }
            }
        }
        // Reconstruct path
        const path = [];
        let current = toId;
        while (current !== null) {
            path.unshift(current);
            current = previous.get(current);
        }
        // Verify path is valid
        if (path[0] !== fromId) {
            return null;
        }
        return {
            distance: distances.get(toId),
            path,
        };
    }
    /**
     * Estimate travel time considering current congestion
     * 需求 11.2, 11.3: 返回估计总时间和每段详细信息
     */
    estimateTime(locationIds, currentTime, congestionManager) {
        // Validate all location IDs
        for (const locationId of locationIds) {
            if (!this.nodes.has(locationId)) {
                return null;
            }
        }
        // Need at least 2 locations
        if (locationIds.length < 2) {
            return null;
        }
        const segments = [];
        let totalTime = 0;
        // Calculate time for each segment
        for (let i = 0; i < locationIds.length - 1; i++) {
            const fromId = locationIds[i];
            const toId = locationIds[i + 1];
            // Get shortest path for this segment
            const pathResult = this.calculateDistance(fromId, toId);
            if (!pathResult) {
                return null;
            }
            // Calculate time for each edge in the path
            let segmentTime = 0;
            let segmentDistance = 0;
            for (let j = 0; j < pathResult.path.length - 1; j++) {
                const edgeFrom = pathResult.path[j];
                const edgeTo = pathResult.path[j + 1];
                const edge = this.adjacency.get(edgeFrom).get(edgeTo);
                // Get current congestion for this edge
                const congestion = congestionManager.getCongestion(edge, currentTime);
                const speed = CongestionManager.congestionToSpeed(congestion);
                // Calculate time for this edge (distance / speed * 60 = minutes)
                const edgeTime = (edge.distance / speed) * 60;
                segmentTime += edgeTime;
                segmentDistance += edge.distance;
            }
            // Get average congestion for the segment
            const avgCongestion = this.getAverageCongestion(pathResult.path, currentTime, congestionManager);
            const avgSpeed = CongestionManager.congestionToSpeed(avgCongestion);
            segments.push({
                from: fromId,
                to: toId,
                distance: pathResult.distance,
                congestion: CongestionManager.getCongestionLevelName(avgCongestion),
                speed: avgSpeed,
                time: segmentTime,
                path: pathResult.path, // 包含详细路径
            });
            totalTime += segmentTime;
        }
        return {
            totalTime,
            segments,
        };
    }
    /**
     * Get average congestion along a path
     */
    getAverageCongestion(path, currentTime, congestionManager) {
        if (path.length < 2) {
            return 0;
        }
        let totalCongestion = 0;
        let edgeCount = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const edge = this.adjacency.get(from).get(to);
            const congestion = congestionManager.getCongestion(edge, currentTime);
            totalCongestion += congestion;
            edgeCount++;
        }
        return edgeCount > 0 ? totalCongestion / edgeCount : 0;
    }
    /**
     * Get edge between two nodes (if exists)
     */
    getEdge(fromId, toId) {
        const neighbors = this.adjacency.get(fromId);
        if (!neighbors) {
            return null;
        }
        return neighbors.get(toId) || null;
    }
    /**
     * Check if a path exists between two nodes
     */
    hasPath(fromId, toId) {
        return this.calculateDistance(fromId, toId) !== null;
    }
}
//# sourceMappingURL=pathfinder.js.map