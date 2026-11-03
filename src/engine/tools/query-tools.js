/**
 * 信息查询工具
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：4.1-4.5, 5.1-5.4, 11.1-11.3
 */
/**
 * Format time as HH:mm
 */
function formatTimeHHMM(minutes) {
    const hours = Math.floor(minutes / 60) % 24;
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
/**
 * Format remaining time as "xx小时xx分钟"
 */
function formatRemainingTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) {
        return `${hours}小时${mins}分钟`;
    }
    else if (hours > 0) {
        return `${hours}小时`;
    }
    else {
        return `${mins}分钟`;
    }
}
/**
 * 获取智能体当前状态
 * 需求：4.1-4.5
 */
export const getMyStatusTool = {
    name: 'get_my_status',
    description: '获取智能体的当前状态，包括位置、电量、携带订单、重量、承载能力和当前时间',
    parameters: {},
    handler: async (_params, context) => {
        const { agentState, currentTime, simulator } = context;
        const allOrders = agentState.getCarriedOrders();
        // 分离已接受但未取餐的订单和已取餐的订单
        const acceptedOrders = allOrders
            .filter(order => !order.pickedUp)
            .map(order => ({
            id: order.id,
            type: order.type,
            name: order.name,
            weight: order.weight,
            deadline: order.deadline || 0,
            pickupLocation: order.pickupLocation,
            deliveryLocation: order.deliveryLocation,
        }));
        const carriedOrders = allOrders
            .filter(order => order.pickedUp && !order.delivered)
            .map(order => ({
            id: order.id,
            type: order.type,
            name: order.name,
            weight: order.weight,
            deadline: order.deadline || 0,
            pickupLocation: order.pickupLocation,
            deliveryLocation: order.deliveryLocation,
        }));
        // Get remaining time from simulator
        const remainingTime = simulator ? simulator.getGameClock().getRemainingTime() : 0;
        const response = {
            position: agentState.getPosition(),
            battery: agentState.getBattery(),
            batteryRange: agentState.getBatteryRange(),
            acceptedOrders,
            carriedOrders,
            totalWeight: agentState.getTotalWeight(),
            remainingCapacity: agentState.getRemainingCapacity(),
            currentTime,
            formattedTime: formatTimeHHMM(currentTime),
            remainingTime,
            formattedRemainingTime: formatRemainingTime(remainingTime),
            profit: agentState.getProfit(),
        };
        return {
            success: true,
            data: response,
        };
    },
};
/**
 * 搜索附近的可用订单
 * 需求：5.1-5.4
 */
export const searchNearbyOrdersTool = {
    name: 'search_nearby_orders',
    description: '搜索指定半径内的所有可用订单',
    parameters: {
        radius: {
            type: 'number',
            required: true,
            description: '搜索半径（km）',
            min: 0,
        },
    },
    handler: async (params, context) => {
        const { agentState, orderGenerator, pathfinder } = context;
        const radius = params.radius;
        // 获取智能体当前位置
        const agentPosition = agentState.getPosition();
        // 搜索附近订单
        const nearbyOrders = orderGenerator.searchNearbyOrders(agentPosition, radius, (from, to) => {
            const result = pathfinder.calculateDistance(from, to);
            return result ? result.distance : Infinity;
        });
        // 格式化订单信息
        const orders = nearbyOrders.map(order => ({
            id: order.id,
            type: order.type,
            name: order.name,
            deliveryFee: order.deliveryFee,
            weight: order.weight,
            itemPrice: order.itemPrice,
            pickupLocation: order.pickupLocation,
            deliveryLocation: order.deliveryLocation,
            distance: order.distance,
            estimatedTimeLimit: order.timeLimit,
        }));
        return {
            success: true,
            data: { orders },
        };
    },
};
/**
 * 搜索附近的换电站
 */
export const searchNearbyBatteryStationsTool = {
    name: 'search_nearby_battery_stations',
    description: '搜索指定半径内的所有换电站',
    parameters: {
        radius: {
            type: 'number',
            required: true,
            description: '搜索半径（km）',
            min: 0,
        },
    },
    handler: async (params, context) => {
        const { agentState, pathfinder, nodes, congestionManager, currentTime } = context;
        const radius = params.radius;
        // 获取智能体当前位置
        const agentPosition = agentState.getPosition();
        // 查找所有换电站
        const batteryStations = Array.from(nodes.values()).filter(node => node.type === 'battery_swap');
        // 计算距离并筛选在半径内的换电站
        const nearbyStations = batteryStations
            .map(station => {
            const distanceResult = pathfinder.calculateDistance(agentPosition, station.id);
            if (!distanceResult) {
                return null;
            }
            const distance = distanceResult.distance;
            if (distance > radius) {
                return null;
            }
            // 估算到达时间
            const path = distanceResult.path;
            let totalTime = 0;
            for (let i = 0; i < path.length - 1; i++) {
                const from = path[i];
                const to = path[i + 1];
                const edgeId = `${from}-${to}`;
                const reverseEdgeId = `${to}-${from}`;
                // 获取拥堵程度
                const congestionMap = congestionManager.updateCongestion(currentTime);
                const congestion = congestionMap.get(edgeId) || congestionMap.get(reverseEdgeId) || 0;
                // 计算速度
                let speed = 30; // 默认速度
                if (congestion < 0.3)
                    speed = 30;
                else if (congestion < 0.5)
                    speed = 25;
                else if (congestion < 0.7)
                    speed = 20;
                else
                    speed = 15;
                // 计算这一段的距离
                const segmentResult = pathfinder.calculateDistance(from, to);
                if (segmentResult) {
                    const segmentDistance = segmentResult.distance;
                    totalTime += (segmentDistance / speed) * 60; // 转换为分钟
                }
            }
            return {
                id: station.id,
                name: station.name,
                distance,
                estimatedTime: totalTime,
                position: station.position,
            };
        })
            .filter((station) => station !== null)
            .sort((a, b) => a.distance - b.distance); // 按距离排序
        return {
            success: true,
            data: { stations: nearbyStations },
        };
    },
};
/**
 * 获取位置信息
 * 需求：11.1-11.3
 */
export const getLocationInfoTool = {
    name: 'get_location_info',
    description: '获取指定位置的详细信息，包括相邻的位置和距离',
    parameters: {
        locationId: {
            type: 'string',
            required: true,
            description: '位置节点 ID',
        },
    },
    handler: async (params, context) => {
        const { nodes, simulator } = context;
        const locationId = params.locationId;
        // 检查位置是否存在
        const node = nodes.get(locationId);
        if (!node) {
            return {
                success: false,
                error: {
                    code: 'INVALID_LOCATION',
                    message: `Location not found: ${locationId}`,
                    details: { locationId },
                },
            };
        }
        // Build neighbors list from edges
        const neighbors = [];
        if (simulator) {
            const edges = simulator.getEdges();
            for (const edge of edges) {
                let neighborId = null;
                // Check if this edge connects to the target location
                if (edge.from === locationId) {
                    neighborId = edge.to;
                }
                else if (edge.to === locationId) {
                    neighborId = edge.from;
                }
                if (neighborId) {
                    const neighborNode = nodes.get(neighborId);
                    if (neighborNode) {
                        neighbors.push({
                            id: neighborId,
                            name: neighborNode.name,
                            type: neighborNode.type,
                            distance: `${edge.distance.toFixed(2)}km`,
                        });
                    }
                }
            }
            // Sort by distance
            neighbors.sort((a, b) => {
                const distA = parseFloat(a.distance);
                const distB = parseFloat(b.distance);
                return distA - distB;
            });
        }
        const response = {
            id: node.id,
            type: node.type,
            name: node.name,
            position: { ...node.position },
            neighbors,
        };
        return {
            success: true,
            data: response,
        };
    },
};
/**
 * 计算两点之间的距离
 * 需求：11.1
 */
export const calculateDistanceTool = {
    name: 'calculate_distance',
    description: '计算两个位置之间的最短路径距离',
    parameters: {
        fromId: {
            type: 'string',
            required: true,
            description: '起点位置 ID',
        },
        toId: {
            type: 'string',
            required: true,
            description: '终点位置 ID',
        },
    },
    handler: async (params, context) => {
        const { pathfinder, nodes } = context;
        const fromId = params.fromId;
        const toId = params.toId;
        // 验证位置 ID
        if (!nodes.has(fromId)) {
            return {
                success: false,
                error: {
                    code: 'INVALID_LOCATION',
                    message: `Invalid from location: ${fromId}`,
                    details: { fromId },
                },
            };
        }
        if (!nodes.has(toId)) {
            return {
                success: false,
                error: {
                    code: 'INVALID_LOCATION',
                    message: `Invalid to location: ${toId}`,
                    details: { toId },
                },
            };
        }
        // 计算距离
        const result = pathfinder.calculateDistance(fromId, toId);
        if (!result) {
            return {
                success: false,
                error: {
                    code: 'INVALID_LOCATION',
                    message: `No path found between ${fromId} and ${toId}`,
                    details: { fromId, toId },
                },
            };
        }
        return {
            success: true,
            data: result,
        };
    },
};
/**
 * 估算通行时间
 * 需求：11.2, 11.3
 */
export const estimateTimeTool = {
    name: 'estimate_time',
    description: '估算沿指定路径的总通行时间，考虑当前拥堵情况',
    parameters: {
        locationIds: {
            type: 'array',
            required: true,
            description: '位置 ID 列表（按顺序）',
            items: {
                type: 'string',
            },
        },
    },
    handler: async (params, context) => {
        const { pathfinder, congestionManager, currentTime, nodes } = context;
        const locationIds = params.locationIds;
        // 验证参数
        if (!Array.isArray(locationIds) || locationIds.length < 2) {
            return {
                success: false,
                error: {
                    code: 'INVALID_PARAMETER',
                    message: 'locationIds must be an array with at least 2 elements',
                    details: { locationIds },
                },
            };
        }
        // 验证所有位置 ID
        for (const locationId of locationIds) {
            if (!nodes.has(locationId)) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_LOCATION',
                        message: `Invalid location: ${locationId}`,
                        details: { locationId },
                    },
                };
            }
        }
        // 估算时间
        const result = pathfinder.estimateTime(locationIds, currentTime, congestionManager);
        if (!result) {
            return {
                success: false,
                error: {
                    code: 'INVALID_LOCATION',
                    message: 'Unable to estimate time for the given path',
                    details: { locationIds },
                },
            };
        }
        return {
            success: true,
            data: result,
        };
    },
};
/**
 * 获取帮助信息
 * 返回系统提示词作为帮助文档
 *
 * 这个工具复用系统提示词生成逻辑，确保帮助信息与初始提示词保持一致
 */
export const helpTool = {
    name: 'help',
    description: '显示帮助信息，包括所有可用工具、游戏规则和策略建议',
    parameters: {},
    handler: async (_params, context) => {
        // 从 context 中获取 simulator
        const simulator = context.simulator;
        if (!simulator) {
            return {
                success: false,
                error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Simulator not available in context',
                    details: {},
                },
            };
        }
        // 动态导入以避免循环依赖
        const { generateSystemPrompt } = await import('../client/system-prompt.js');
        // 生成帮助信息（复用系统提示词）
        const helpText = generateSystemPrompt(simulator);
        return {
            success: true,
            data: {
                help: helpText,
            },
        };
    },
};
/**
 * 获取地图信息
 * 返回完整地图数据，包括按类型分组的位置列表和邻接表
 */
export const getMapTool = {
    name: 'get_map',
    description: '获取完整地图信息，包括所有位置（按类型分组）和连接关系（邻接表）',
    parameters: {},
    handler: async (_params, context) => {
        const { nodes, simulator } = context;
        if (!simulator) {
            return {
                success: false,
                error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Simulator not available in context',
                    details: {},
                },
            };
        }
        // Get edges from simulator
        const edges = simulator.getEdges();
        // Build locations by type
        const locationsByType = {
            restaurant: [],
            supermarket: [],
            pharmacy: [],
            residential: [],
            office: [],
            battery_swap: [],
        };
        // Group nodes by type
        for (const node of nodes.values()) {
            const label = `${node.id}(${node.name})`;
            const nodeType = node.type;
            if (locationsByType[nodeType]) {
                locationsByType[nodeType].push(label);
            }
        }
        // Build adjacency list (connections)
        const connections = {};
        // Initialize empty arrays for all nodes
        for (const node of nodes.values()) {
            connections[node.id] = [];
        }
        // Add edges (bidirectional)
        for (const edge of edges) {
            const fromNode = nodes.get(edge.from);
            const toNode = nodes.get(edge.to);
            if (fromNode && toNode) {
                // Add forward direction
                connections[edge.from].push({
                    to: edge.to,
                    name: toNode.name,
                    type: toNode.type,
                    distance: `${edge.distance.toFixed(2)}km`,
                });
                // Add reverse direction (bidirectional roads)
                connections[edge.to].push({
                    to: edge.from,
                    name: fromNode.name,
                    type: fromNode.type,
                    distance: `${edge.distance.toFixed(2)}km`,
                });
            }
        }
        // Sort connections by distance for each node
        for (const nodeId of Object.keys(connections)) {
            connections[nodeId].sort((a, b) => {
                const distA = parseFloat(a.distance);
                const distB = parseFloat(b.distance);
                return distA - distB;
            });
        }
        return {
            success: true,
            data: {
                locationsByType,
                connections,
            },
        };
    },
};
/**
 * 获取所有查询工具
 */
export function getQueryTools() {
    return [
        getMyStatusTool,
        searchNearbyOrdersTool,
        searchNearbyBatteryStationsTool,
        getLocationInfoTool,
        calculateDistanceTool,
        estimateTimeTool,
        helpTool,
        getMapTool,
    ];
}
// ============================================================================
// V3 版本工具（多骑手模式）
// 所有工具都需要 agent_id 参数来指定操作哪个骑手
// ============================================================================
/**
 * 将 V1/V2 工具转换为 V3 版本
 * V3 版本的工具会在参数中添加 agent_id
 */
function createV3Tool(baseTool) {
    return {
        name: baseTool.name,
        description: baseTool.description + '（需要指定 agent_id）',
        parameters: {
            agent_id: {
                type: 'string',
                required: true,
                description: '骑手 ID（如 agent_1, agent_2, agent_3）',
            },
            ...baseTool.parameters,
        },
        handler: baseTool.handler,
    };
}
/**
 * V3 版本：获取指定骑手的状态
 */
export const getMyStatusToolV3 = createV3Tool(getMyStatusTool);
/**
 * V3 版本：搜索附近订单
 */
export const searchNearbyOrdersToolV3 = createV3Tool(searchNearbyOrdersTool);
/**
 * V3 版本：搜索附近换电站
 */
export const searchNearbyBatteryStationsToolV3 = createV3Tool(searchNearbyBatteryStationsTool);
/**
 * V3 版本：获取位置信息
 */
export const getLocationInfoToolV3 = createV3Tool(getLocationInfoTool);
/**
 * V3 版本：计算距离
 */
export const calculateDistanceToolV3 = createV3Tool(calculateDistanceTool);
/**
 * V3 版本：估算时间
 */
export const estimateTimeToolV3 = createV3Tool(estimateTimeTool);
/**
 * V3 版本：帮助工具
 */
export const helpToolV3 = createV3Tool(helpTool);
/**
 * V3 版本：获取地图
 */
export const getMapToolV3 = createV3Tool(getMapTool);
/**
 * 获取所有 V3 版本查询工具（多骑手模式）
 */
export function getQueryToolsV3() {
    return [
        getMyStatusToolV3,
        searchNearbyOrdersToolV3,
        searchNearbyBatteryStationsToolV3,
        getLocationInfoToolV3,
        calculateDistanceToolV3,
        estimateTimeToolV3,
        helpToolV3,
        getMapToolV3,
    ];
}
//# sourceMappingURL=query-tools.js.map