/**
 * Map Generator
 * Generates deterministic maps from seeds for the Silicon Rider Bench
 */
import { SeededRNG } from '../utils/seeded-rng.js';
/**
 * Node type distribution configuration
 */
const NODE_TYPE_DISTRIBUTION = {
    restaurant: { min: 0.30, max: 0.40 },
    supermarket: { min: 0.10, max: 0.15 },
    pharmacy: { min: 0.05, max: 0.10 },
    residential: { min: 0.20, max: 0.30 },
    office: { min: 0.10, max: 0.15 },
    battery_swap: { min: 0.05, max: 0.10 },
};
/**
 * Map size configurations
 */
const MAP_SIZE_CONFIG = {
    small: {
        nodeCount: 10,
        gridSize: 5,
        maxEdgeDistance: 3,
    },
    large: {
        nodeCount: 100,
        gridSize: 15,
        maxEdgeDistance: 5,
    },
};
/**
 * Generate a deterministic map from a seed
 */
export function generateMap(config) {
    const rng = new SeededRNG(config.seed);
    const sizeConfig = MAP_SIZE_CONFIG[config.size];
    // Generate nodes (with optional exclusion of certain types)
    const nodes = generateNodes(rng, sizeConfig.nodeCount, sizeConfig.gridSize, config.excludeNodeTypes);
    // Generate edges
    const edges = generateEdges(rng, nodes, sizeConfig.maxEdgeDistance);
    return {
        nodes,
        edges,
        seed: config.seed,
    };
}
/**
 * Generate nodes using grid-based city street layout
 */
function generateNodes(rng, nodeCount, gridSize, excludeNodeTypes) {
    const nodes = new Map();
    // Determine node type counts based on distribution
    const typeCounts = determineNodeTypeCounts(rng, nodeCount, excludeNodeTypes);
    // Generate all node types
    const nodeTypes = [];
    for (const [type, count] of Object.entries(typeCounts)) {
        for (let i = 0; i < count; i++) {
            nodeTypes.push(type);
        }
    }
    // Shuffle to randomize placement
    const shuffledTypes = rng.shuffle(nodeTypes);
    // Create street grid - determine number of streets
    const streetCount = Math.ceil(Math.sqrt(nodeCount * 1.5));
    const streetSpacing = gridSize / (streetCount + 1);
    // Generate street coordinates (整数位置，确保间隔足够大)
    const streets = { x: [], y: [] };
    for (let i = 1; i <= streetCount; i++) {
        const coord = Math.round(i * streetSpacing); // 使用整数坐标
        streets.x.push(coord);
        streets.y.push(coord);
    }
    // Generate all possible intersection points
    const intersections = [];
    for (const x of streets.x) {
        for (const y of streets.y) {
            intersections.push({ x, y, streetX: x, streetY: y });
        }
    }
    // Shuffle intersections for random placement
    const shuffledIntersections = rng.shuffle(intersections);
    // Place nodes at intersections or along streets
    const usedPositions = new Set();
    for (let i = 0; i < shuffledTypes.length; i++) {
        const type = shuffledTypes[i];
        // Try to find an unused intersection
        let position = null;
        for (const intersection of shuffledIntersections) {
            const posKey = `${intersection.x},${intersection.y}`;
            if (!usedPositions.has(posKey)) {
                // Place at intersection - NO random offset to keep nodes on streets
                position = {
                    x: intersection.x,
                    y: intersection.y,
                    streetX: intersection.streetX,
                    streetY: intersection.streetY,
                };
                usedPositions.add(posKey);
                break;
            }
        }
        // If all intersections are used, place along a street
        if (!position) {
            const useXStreet = rng.nextFloat() < 0.5;
            if (useXStreet) {
                // Place on a vertical street (fixed X)
                const streetX = streets.x[rng.nextInt(0, streets.x.length - 1)];
                const y = rng.nextFloatRange(streetSpacing / 2, gridSize - streetSpacing / 2);
                position = { x: streetX, y, streetX };
            }
            else {
                // Place on a horizontal street (fixed Y)
                const streetY = streets.y[rng.nextInt(0, streets.y.length - 1)];
                const x = rng.nextFloatRange(streetSpacing / 2, gridSize - streetSpacing / 2);
                position = { x, y: streetY, streetY };
            }
        }
        const node = {
            id: `node_${i}`,
            type,
            position: { x: position.x, y: position.y },
            name: generateNodeName(type, i),
            emoji: getRandomEmoji(rng, type),
        };
        nodes.set(node.id, node);
    }
    return nodes;
}
/**
 * Determine how many nodes of each type to generate
 * Uses proportional allocation to ensure each type gets its fair share
 */
function determineNodeTypeCounts(rng, totalNodes, excludeNodeTypes) {
    const counts = {
        restaurant: 0,
        supermarket: 0,
        pharmacy: 0,
        residential: 0,
        office: 0,
        battery_swap: 0,
    };
    // Filter out excluded types
    const excludeSet = new Set(excludeNodeTypes || []);
    const types = Object.keys(NODE_TYPE_DISTRIBUTION).filter(type => !excludeSet.has(type));
    if (types.length === 0) {
        throw new Error('Cannot exclude all node types');
    }
    // First pass: ensure at least one of each included type
    for (const type of types) {
        counts[type] = 1;
    }
    // Second pass: calculate target counts based on proportions
    const targetCounts = { ...counts };
    for (const type of types) {
        const dist = NODE_TYPE_DISTRIBUTION[type];
        // Calculate target count with some randomness within the range
        const minCount = Math.max(1, Math.floor(totalNodes * dist.min));
        const maxCount = Math.ceil(totalNodes * dist.max);
        // Add some randomness: pick a value between min and max
        const randomFactor = rng.nextFloat(); // 0 to 1
        const targetCount = Math.round(minCount + (maxCount - minCount) * randomFactor);
        targetCounts[type] = Math.max(1, targetCount);
    }
    // Third pass: normalize to ensure total equals totalNodes
    let currentTotal = Object.values(targetCounts).reduce((sum, c) => sum + c, 0);
    // Adjust counts to match totalNodes
    // Add a maximum iteration limit to prevent infinite loops
    let iterations = 0;
    const maxIterations = totalNodes * 10;
    while (currentTotal !== totalNodes && iterations < maxIterations) {
        iterations++;
        if (currentTotal < totalNodes) {
            // Need to add nodes - pick a random type
            const typeIndex = rng.nextInt(0, types.length - 1);
            const type = types[typeIndex];
            const dist = NODE_TYPE_DISTRIBUTION[type];
            const maxCount = Math.ceil(totalNodes * dist.max);
            // Only add if we haven't exceeded the max for this type
            if (targetCounts[type] < maxCount) {
                targetCounts[type]++;
                currentTotal++;
            }
            else {
                // If all types are at max, force add to a random type (break max constraint)
                // This happens when excludeNodeTypes reduces available capacity
                let allAtMax = true;
                for (const t of types) {
                    const d = NODE_TYPE_DISTRIBUTION[t];
                    if (targetCounts[t] < Math.ceil(totalNodes * d.max)) {
                        allAtMax = false;
                        break;
                    }
                }
                if (allAtMax) {
                    // Force add to the type with highest max proportion
                    targetCounts[type]++;
                    currentTotal++;
                }
            }
        }
        else {
            // Need to remove nodes - pick a random type (avoid going below min)
            const typeIndex = rng.nextInt(0, types.length - 1);
            const type = types[typeIndex];
            const dist = NODE_TYPE_DISTRIBUTION[type];
            const minCount = Math.max(1, Math.floor(totalNodes * dist.min));
            // Only remove if we haven't gone below the min for this type
            if (targetCounts[type] > minCount && targetCounts[type] > 1) {
                targetCounts[type]--;
                currentTotal--;
            }
            else {
                // If all types are at min, force remove from a random type
                let allAtMin = true;
                for (const t of types) {
                    const d = NODE_TYPE_DISTRIBUTION[t];
                    const min = Math.max(1, Math.floor(totalNodes * d.min));
                    if (targetCounts[t] > min && targetCounts[t] > 1) {
                        allAtMin = false;
                        break;
                    }
                }
                if (allAtMin && targetCounts[type] > 1) {
                    targetCounts[type]--;
                    currentTotal--;
                }
            }
        }
    }
    // If we still couldn't reach the target, log a warning
    if (currentTotal !== totalNodes) {
        console.warn(`[MapGenerator] Could not reach exact node count. Target: ${totalNodes}, Actual: ${currentTotal}`);
    }
    // Copy final counts
    for (const type of types) {
        counts[type] = targetCounts[type];
    }
    return counts;
}
/**
 * Emoji options for each node type
 */
const NODE_EMOJI_OPTIONS = {
    restaurant: [
        '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗',
        '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙',
        '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🥫',
        '🍝', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍠', '🍢', '🍣',
        '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨',
        '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮',
        '🍯', '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎',
        '🍏', '🍐', '🍑', '🍒', '🍓'
    ],
    supermarket: ['🛒'],
    pharmacy: ['💊'],
    residential: ['🏠'],
    office: ['🏢'],
    battery_swap: ['🔋'],
};
/**
 * Generate a name for a node based on its type
 */
function generateNodeName(type, index) {
    const names = {
        restaurant: '餐厅',
        supermarket: '超市',
        pharmacy: '药店',
        residential: '居民区',
        office: '写字楼',
        battery_swap: '换电站',
    };
    return `${names[type]}_${index}`;
}
/**
 * Get a random emoji for a node type
 */
function getRandomEmoji(rng, type) {
    const options = NODE_EMOJI_OPTIONS[type];
    const index = rng.nextInt(0, options.length - 1);
    return options[index];
}
/**
 * Generate edges connecting nodes using grid-based street layout
 * Creates a more realistic city street pattern with mostly horizontal and vertical streets
 */
function generateEdges(rng, nodes, maxEdgeDistance) {
    const edges = [];
    const nodeArray = Array.from(nodes.values());
    const edgeSet = new Set();
    // Tolerance for considering nodes on the same street (must be very small now)
    const streetTolerance = 0.5;
    // Group nodes by X coordinate (vertical streets)
    const nodesByXStreet = new Map();
    for (const node of nodeArray) {
        const streetX = Math.round(node.position.x); // 四舍五入到整数
        if (!nodesByXStreet.has(streetX)) {
            nodesByXStreet.set(streetX, []);
        }
        nodesByXStreet.get(streetX).push(node);
    }
    // Group nodes by Y coordinate (horizontal streets)
    const nodesByYStreet = new Map();
    for (const node of nodeArray) {
        const streetY = Math.round(node.position.y); // 四舍五入到整数
        if (!nodesByYStreet.has(streetY)) {
            nodesByYStreet.set(streetY, []);
        }
        nodesByYStreet.get(streetY).push(node);
    }
    // Connect nodes on the same vertical street
    for (const [, streetNodes] of nodesByXStreet) {
        if (streetNodes.length < 2)
            continue;
        // Sort by Y coordinate
        const sorted = streetNodes.sort((a, b) => a.position.y - b.position.y);
        // Connect adjacent nodes on this street
        for (let i = 0; i < sorted.length - 1; i++) {
            const node = sorted[i];
            const next = sorted[i + 1];
            const distance = calculateEuclideanDistance(node.position, next.position);
            // Only connect if reasonably close
            if (distance <= maxEdgeDistance) {
                addEdge(edges, edgeSet, node.id, next.id, distance, rng);
            }
        }
    }
    // Connect nodes on the same horizontal street
    for (const [, streetNodes] of nodesByYStreet) {
        if (streetNodes.length < 2)
            continue;
        // Sort by X coordinate
        const sorted = streetNodes.sort((a, b) => a.position.x - b.position.x);
        // Connect adjacent nodes on this street
        for (let i = 0; i < sorted.length - 1; i++) {
            const node = sorted[i];
            const next = sorted[i + 1];
            const distance = calculateEuclideanDistance(node.position, next.position);
            // Only connect if reasonably close
            if (distance <= maxEdgeDistance) {
                addEdge(edges, edgeSet, node.id, next.id, distance, rng);
            }
        }
    }
    // Add occasional diagonal connections (5% chance for each node)
    for (const node of nodeArray) {
        if (rng.nextFloat() > 0.05)
            continue; // Only 5% of nodes get diagonal connections
        const distances = nodeArray
            .filter(other => other.id !== node.id)
            .map(other => ({
            node: other,
            distance: calculateEuclideanDistance(node.position, other.position),
            dx: Math.abs(other.position.x - node.position.x),
            dy: Math.abs(other.position.y - node.position.y),
        }))
            .filter(d => {
            // Only consider diagonal connections (not on same street)
            return d.dx > streetTolerance && d.dy > streetTolerance;
        })
            .sort((a, b) => a.distance - b.distance);
        // Add one diagonal connection to nearest diagonal neighbor
        if (distances.length > 0) {
            const { node: other, distance } = distances[0];
            if (distance <= maxEdgeDistance * 0.8) {
                addEdge(edges, edgeSet, node.id, other.id, distance, rng);
            }
        }
    }
    // Ensure graph connectivity
    ensureConnectivity(rng, nodeArray, edges, edgeSet);
    return edges;
}
/**
 * Helper function to add an edge
 */
function addEdge(edges, edgeSet, from, to, distance, rng) {
    const edgeKey1 = `${from}-${to}`;
    const edgeKey2 = `${to}-${from}`;
    if (!edgeSet.has(edgeKey1) && !edgeSet.has(edgeKey2)) {
        edgeSet.add(edgeKey1);
        edges.push({
            from,
            to,
            distance,
            baseCongestion: rng.nextFloatRange(0.1, 0.3),
        });
    }
}
/**
 * Calculate Euclidean distance between two positions
 */
function calculateEuclideanDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
}
/**
 * Ensure the graph is connected by adding edges between disconnected components
 */
function ensureConnectivity(rng, nodes, edges, edgeSet) {
    // Build adjacency list
    const adjacency = new Map();
    for (const node of nodes) {
        adjacency.set(node.id, new Set());
    }
    for (const edge of edges) {
        adjacency.get(edge.from).add(edge.to);
        adjacency.get(edge.to).add(edge.from);
    }
    // Find connected components using BFS
    const visited = new Set();
    const components = [];
    for (const node of nodes) {
        if (!visited.has(node.id)) {
            const component = [];
            const queue = [node.id];
            visited.add(node.id);
            while (queue.length > 0) {
                const current = queue.shift();
                component.push(current);
                for (const neighbor of adjacency.get(current)) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            components.push(component);
        }
    }
    // Connect components if there are multiple
    if (components.length > 1) {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        for (let i = 1; i < components.length; i++) {
            // Connect component i to component 0
            const comp1 = components[0];
            const comp2 = components[i];
            // Find closest pair of nodes between components
            let minDistance = Infinity;
            let bestPair = null;
            for (const id1 of comp1) {
                for (const id2 of comp2) {
                    const node1 = nodeMap.get(id1);
                    const node2 = nodeMap.get(id2);
                    const distance = calculateEuclideanDistance(node1.position, node2.position);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestPair = [id1, id2];
                    }
                }
            }
            if (bestPair) {
                const [id1, id2] = bestPair;
                const edgeKey = `${id1}-${id2}`;
                if (!edgeSet.has(edgeKey) && !edgeSet.has(`${id2}-${id1}`)) {
                    edgeSet.add(edgeKey);
                    edges.push({
                        from: id1,
                        to: id2,
                        distance: minDistance,
                        baseCongestion: rng.nextFloatRange(0.1, 0.3),
                    });
                    // Update adjacency
                    adjacency.get(id1).add(id2);
                    adjacency.get(id2).add(id1);
                }
            }
        }
    }
}
//# sourceMappingURL=map-generator.js.map