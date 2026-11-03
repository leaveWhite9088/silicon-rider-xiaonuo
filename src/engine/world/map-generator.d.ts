/**
 * Map Generator
 * Generates deterministic maps from seeds for the Silicon Rider Bench
 */
import { Node, Edge, NodeType } from '../types/index.js';
/**
 * Map generation configuration
 */
export interface MapConfig {
    seed: number;
    size: 'small' | 'large';
    excludeNodeTypes?: NodeType[];
}
/**
 * Generated map result
 */
export interface GeneratedMap {
    nodes: Map<string, Node>;
    edges: Edge[];
    seed: number;
}
/**
 * Generate a deterministic map from a seed
 */
export declare function generateMap(config: MapConfig): GeneratedMap;
//# sourceMappingURL=map-generator.d.ts.map