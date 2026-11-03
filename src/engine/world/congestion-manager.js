/**
 * Congestion Manager
 * Manages dynamic congestion levels based on time of day
 */
/**
 * Congestion level enum
 */
export var CongestionLevel;
(function (CongestionLevel) {
    CongestionLevel[CongestionLevel["NORMAL"] = 0] = "NORMAL";
    CongestionLevel[CongestionLevel["LIGHT"] = 1] = "LIGHT";
    CongestionLevel[CongestionLevel["MODERATE"] = 2] = "MODERATE";
    CongestionLevel[CongestionLevel["HEAVY"] = 3] = "HEAVY";
})(CongestionLevel || (CongestionLevel = {}));
const RUSH_HOUR_CONFIG = {
    morningStart: 7 * 60, // 7:00
    morningEnd: 9 * 60, // 9:00
    eveningStart: 17 * 60, // 17:00
    eveningEnd: 19 * 60, // 19:00
    congestionIncrease: 0.3,
};
/**
 * Congestion Manager class
 */
export class CongestionManager {
    edges;
    nodes;
    mapCenter;
    mapRadius;
    constructor(edges, nodes) {
        this.edges = edges;
        this.nodes = nodes;
        // Calculate map center and radius
        const positions = Array.from(nodes.values()).map(n => n.position);
        this.mapCenter = this.calculateMapCenter(positions);
        this.mapRadius = this.calculateMapRadius(positions, this.mapCenter);
    }
    /**
     * Calculate the center of the map
     */
    calculateMapCenter(positions) {
        if (positions.length === 0) {
            return { x: 0, y: 0 };
        }
        const sum = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), { x: 0, y: 0 });
        return {
            x: sum.x / positions.length,
            y: sum.y / positions.length,
        };
    }
    /**
     * Calculate the radius of the map (max distance from center)
     */
    calculateMapRadius(positions, center) {
        if (positions.length === 0) {
            return 1;
        }
        const maxDistance = Math.max(...positions.map(pos => {
            const dx = pos.x - center.x;
            const dy = pos.y - center.y;
            return Math.sqrt(dx * dx + dy * dy);
        }));
        return maxDistance || 1;
    }
    /**
     * Calculate distance from map center for a position
     */
    distanceFromCenter(position) {
        const dx = position.x - this.mapCenter.x;
        const dy = position.y - this.mapCenter.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * Check if an edge is at the map edge (outer area)
     */
    isAtMapEdge(edge) {
        const fromNode = this.nodes.get(edge.from);
        const toNode = this.nodes.get(edge.to);
        if (!fromNode || !toNode) {
            return false;
        }
        const fromDistance = this.distanceFromCenter(fromNode.position);
        const toDistance = this.distanceFromCenter(toNode.position);
        const avgDistance = (fromDistance + toDistance) / 2;
        // Consider edge as "at map edge" if average distance > 70% of radius
        return avgDistance > this.mapRadius * 0.7;
    }
    /**
     * Check if an edge is at the map center
     */
    isAtMapCenter(edge) {
        const fromNode = this.nodes.get(edge.from);
        const toNode = this.nodes.get(edge.to);
        if (!fromNode || !toNode) {
            return false;
        }
        const fromDistance = this.distanceFromCenter(fromNode.position);
        const toDistance = this.distanceFromCenter(toNode.position);
        const avgDistance = (fromDistance + toDistance) / 2;
        // Consider edge as "at map center" if average distance < 30% of radius
        return avgDistance < this.mapRadius * 0.3;
    }
    /**
     * Update congestion levels based on current game time
     * Returns a map of edge ID to congestion level
     */
    updateCongestion(currentTime) {
        const congestionMap = new Map();
        for (const edge of this.edges) {
            let congestion = edge.baseCongestion;
            // Morning rush hour (7-9 AM): increase congestion at map edges (incoming traffic)
            if (currentTime >= RUSH_HOUR_CONFIG.morningStart && currentTime < RUSH_HOUR_CONFIG.morningEnd) {
                if (this.isAtMapEdge(edge)) {
                    congestion += RUSH_HOUR_CONFIG.congestionIncrease;
                }
            }
            // Evening rush hour (5-7 PM): increase congestion at map center (outgoing traffic)
            if (currentTime >= RUSH_HOUR_CONFIG.eveningStart && currentTime < RUSH_HOUR_CONFIG.eveningEnd) {
                if (this.isAtMapCenter(edge)) {
                    congestion += RUSH_HOUR_CONFIG.congestionIncrease;
                }
            }
            // Clamp congestion to [0, 1]
            congestion = Math.max(0, Math.min(1, congestion));
            const edgeId = this.getEdgeId(edge);
            congestionMap.set(edgeId, congestion);
        }
        return congestionMap;
    }
    /**
     * Get congestion level for a specific edge at a given time
     */
    getCongestion(edge, currentTime) {
        const congestionMap = this.updateCongestion(currentTime);
        const edgeId = this.getEdgeId(edge);
        return congestionMap.get(edgeId) || edge.baseCongestion;
    }
    /**
     * Map congestion value to speed (km/h)
     * 需求 2.4-2.7:
     * - Normal (< 0.3): 30 km/h
     * - Light (0.3-0.5): 25 km/h
     * - Moderate (0.5-0.7): 20 km/h
     * - Heavy (>= 0.7): 15 km/h
     */
    static congestionToSpeed(congestion) {
        if (congestion < 0.3) {
            return 30; // Normal
        }
        else if (congestion < 0.5) {
            return 25; // Light congestion
        }
        else if (congestion < 0.7) {
            return 20; // Moderate congestion
        }
        else {
            return 15; // Heavy congestion
        }
    }
    /**
     * Get congestion level category
     */
    static getCongestionLevel(congestion) {
        if (congestion < 0.3) {
            return CongestionLevel.NORMAL;
        }
        else if (congestion < 0.5) {
            return CongestionLevel.LIGHT;
        }
        else if (congestion < 0.7) {
            return CongestionLevel.MODERATE;
        }
        else {
            return CongestionLevel.HEAVY;
        }
    }
    /**
     * Get congestion level name
     */
    static getCongestionLevelName(congestion) {
        const level = CongestionManager.getCongestionLevel(congestion);
        const names = ['normal', 'light', 'moderate', 'heavy'];
        return names[level];
    }
    /**
     * Generate edge ID for map lookup
     */
    getEdgeId(edge) {
        // Use sorted IDs to handle bidirectional edges
        const ids = [edge.from, edge.to].sort();
        return `${ids[0]}-${ids[1]}`;
    }
}
//# sourceMappingURL=congestion-manager.js.map