/**
 * 信息查询工具
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：4.1-4.5, 5.1-5.4, 11.1-11.3
 */
import { Node, Order } from '../types';
import { AgentState } from '../core/agent-state';
import { OrderGenerator } from '../core/order-generator';
import { Pathfinder } from '../world/pathfinder';
import { CongestionManager } from '../world/congestion-manager';
import { ToolDefinition } from './tool-registry';
/**
 * 工具上下文接口
 * 包含执行工具所需的所有状态和依赖
 */
export interface ToolContext {
    agentState: AgentState;
    agentStates?: Map<string, AgentState>;
    isLevel3?: boolean;
    orderGenerator: OrderGenerator;
    pathfinder: Pathfinder;
    congestionManager: CongestionManager;
    nodes: Map<string, Node>;
    currentTime: number;
    simulator?: any;
    onBatterySwap?: () => void;
    onOrderComplete?: (onTime: boolean, order?: Order, payment?: number, penalty?: number, overtime?: number) => void;
}
/**
 * 获取智能体当前状态
 * 需求：4.1-4.5
 */
export declare const getMyStatusTool: ToolDefinition;
/**
 * 搜索附近的可用订单
 * 需求：5.1-5.4
 */
export declare const searchNearbyOrdersTool: ToolDefinition;
/**
 * 搜索附近的换电站
 */
export declare const searchNearbyBatteryStationsTool: ToolDefinition;
/**
 * 获取位置信息
 * 需求：11.1-11.3
 */
export declare const getLocationInfoTool: ToolDefinition;
/**
 * 计算两点之间的距离
 * 需求：11.1
 */
export declare const calculateDistanceTool: ToolDefinition;
/**
 * 估算通行时间
 * 需求：11.2, 11.3
 */
export declare const estimateTimeTool: ToolDefinition;
/**
 * 获取帮助信息
 * 返回系统提示词作为帮助文档
 *
 * 这个工具复用系统提示词生成逻辑，确保帮助信息与初始提示词保持一致
 */
export declare const helpTool: ToolDefinition;
/**
 * 获取地图信息
 * 返回完整地图数据，包括按类型分组的位置列表和邻接表
 */
export declare const getMapTool: ToolDefinition;
/**
 * 获取所有查询工具
 */
export declare function getQueryTools(): ToolDefinition[];
/**
 * V3 版本：获取指定骑手的状态
 */
export declare const getMyStatusToolV3: ToolDefinition;
/**
 * V3 版本：搜索附近订单
 */
export declare const searchNearbyOrdersToolV3: ToolDefinition;
/**
 * V3 版本：搜索附近换电站
 */
export declare const searchNearbyBatteryStationsToolV3: ToolDefinition;
/**
 * V3 版本：获取位置信息
 */
export declare const getLocationInfoToolV3: ToolDefinition;
/**
 * V3 版本：计算距离
 */
export declare const calculateDistanceToolV3: ToolDefinition;
/**
 * V3 版本：估算时间
 */
export declare const estimateTimeToolV3: ToolDefinition;
/**
 * V3 版本：帮助工具
 */
export declare const helpToolV3: ToolDefinition;
/**
 * V3 版本：获取地图
 */
export declare const getMapToolV3: ToolDefinition;
/**
 * 获取所有 V3 版本查询工具（多骑手模式）
 */
export declare function getQueryToolsV3(): ToolDefinition[];
//# sourceMappingURL=query-tools.d.ts.map