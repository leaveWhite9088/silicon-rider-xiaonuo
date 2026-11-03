/**
 * 模拟器核心
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 整合所有子系统，实现模拟初始化、主循环和终止条件检测
 * 需求：所有核心需求
 */
import { Node, Edge, Order, LevelConfig, WorldState, ToolCallRequest, ToolCallResponse } from '../types';
import { GameClock } from './game-clock';
import { AgentState } from './agent-state';
import { CongestionManager } from '../world/congestion-manager';
import { Pathfinder } from '../world/pathfinder';
import { ToolRegistry } from '../tools/index';
import { ScoreCalculator } from '../scoring/score-calculator';
import { ReceiptDataManager } from '../data/receipt-data-manager';
/**
 * 模拟器状态
 */
export type SimulatorStatus = 'initialized' | 'running' | 'completed' | 'error';
/**
 * 模拟器统计信息
 */
export interface SimulatorStats {
    totalToolCalls: number;
    invalidToolCalls: number;
    completedOrders: number;
    onTimeOrders: number;
    totalProfit: number;
    totalDistance: number;
    batterySwaps: number;
}
/**
 * 模拟器类
 *
 * 核心职责：
 * - 初始化所有子系统（地图、时钟、订单、智能体）
 * - 管理模拟主循环
 * - 处理工具调用
 * - 检测终止条件
 * - 收集统计信息
 */
export declare class Simulator {
    private config;
    private gameClock;
    private agentState;
    private orderGenerator;
    private congestionManager;
    private pathfinder;
    private toolRegistry;
    private toolExecutor;
    private scoreCalculator;
    private orderCountRng;
    private nodes;
    private edges;
    private congestionMap;
    private status;
    private stats;
    private isLevel01;
    private level01OrderCompleted;
    private isLevel2;
    private receiptDataManager;
    private isLevel3;
    private agentStates;
    private riderCount;
    /**
     * 创建模拟器实例
     *
     * @param config Level 配置
     */
    constructor(config: LevelConfig);
    /**
     * 生成初始订单
     */
    private generateInitialOrders;
    /**
     * 执行工具调用
     *
     * @param request 工具调用请求
     * @returns 工具调用响应
     */
    executeToolCall(request: ToolCallRequest): Promise<ToolCallResponse>;
    /**
     * 批量执行工具调用
     *
     * @param requests 工具调用请求数组
     * @returns 工具调用响应数组
     */
    executeToolCalls(requests: ToolCallRequest[]): Promise<ToolCallResponse[]>;
    /**
     * 更新统计信息
     */
    private updateStats;
    /**
     * 检查终止条件
     *
     * @returns true 如果应该终止模拟
     */
    shouldTerminate(): boolean;
    /**
     * 推进模拟（生成新订单等）
     *
     * 在 Level 1/2 中，应该定期调用此方法来生成新订单
     */
    advanceSimulation(): void;
    /**
     * 计算两点间距离（辅助方法）
     */
    private calculateDistance;
    /**
     * 获取当前游戏时间
     */
    getCurrentTime(): number;
    /**
     * 获取格式化的当前时间
     */
    getFormattedTime(): string;
    /**
     * 获取智能体状态
     */
    getAgentState(): AgentState;
    /**
     * 获取世界状态
     */
    getWorldState(): WorldState;
    /**
     * 获取可用订单列表
     */
    getAvailableOrders(): Order[];
    /**
     * 获取统计信息
     */
    getStats(): SimulatorStats;
    /**
     * 获取评分计算器
     */
    getScoreCalculator(): ScoreCalculator;
    /**
     * 获取模拟器状态
     */
    getStatus(): SimulatorStatus;
    /**
     * 设置模拟器状态
     */
    setStatus(status: SimulatorStatus): void;
    /**
     * 获取配置
     */
    getConfig(): LevelConfig;
    /**
     * 获取路径查找器
     */
    getPathfinder(): Pathfinder;
    /**
     * 获取拥堵管理器
     */
    getCongestionManager(): CongestionManager;
    /**
     * 获取工具注册表
     */
    getToolRegistry(): ToolRegistry;
    /**
     * 获取游戏时钟
     */
    getGameClock(): GameClock;
    /**
     * 获取节点信息
     */
    getNode(nodeId: string): Node | undefined;
    /**
     * 获取所有节点
     */
    getNodes(): Map<string, Node>;
    /**
     * 获取所有边
     */
    getEdges(): Edge[];
    /**
     * 是否是 Level 0.1
     */
    isLevel01Mode(): boolean;
    /**
     * 是否是 Level 2 (V2 多模态模式)
     */
    isLevel2Mode(): boolean;
    /**
     * 是否是 Level 3 (多骑手模式)
     */
    isLevel3Mode(): boolean;
    /**
     * 获取骑手数量
     */
    getRiderCount(): number;
    /**
     * 根据 ID 获取指定骑手状态
     * @param agentId 骑手 ID（如 agent_1, agent_2）
     */
    getAgentStateById(agentId: string): AgentState | undefined;
    /**
     * 获取所有骑手状态
     */
    getAllAgentStates(): Map<string, AgentState>;
    /**
     * 获取所有骑手 ID 列表
     */
    getAgentIds(): string[];
    /**
     * 获取所有骑手利润汇总
     */
    getTotalProfit(): number;
    /**
     * 获取小票数据管理器（V2/V3 模式）
     */
    getReceiptDataManager(): ReceiptDataManager | null;
    /**
     * 计算最终评分
     */
    calculateFinalScore(): {
        profit: number;
        onTimeRate: number;
        pathEfficiency: number;
        apiViolationRate: number;
    };
    /**
     * 记录订单完成信息到终端（用于 Web 模式）
     */
    private logOrderCompletion;
    /**
     * 获取订单类型的 emoji
     */
    private getOrderTypeEmoji;
    /**
     * 生成报告摘要
     */
    generateReportSummary(): string;
}
//# sourceMappingURL=simulator.d.ts.map