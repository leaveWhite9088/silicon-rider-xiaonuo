/**
 * 模拟器核心
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 整合所有子系统，实现模拟初始化、主循环和终止条件检测
 * 需求：所有核心需求
 */
import { GameClock } from './game-clock';
import { AgentState } from './agent-state';
import { OrderGenerator } from './order-generator';
import { generateMap } from '../world/map-generator';
import { CongestionManager } from '../world/congestion-manager';
import { Pathfinder } from '../world/pathfinder';
import { ToolExecutor } from '../tools/tool-executor';
import { createToolRegistry, createToolRegistryV3 } from '../tools/index';
import { ScoreCalculator } from '../scoring/score-calculator';
import { SeededRNG } from '../utils/seeded-rng';
import { createReceiptDataManager } from '../data/receipt-data-manager';
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
export class Simulator {
    // 配置
    config;
    // 子系统
    gameClock;
    agentState;
    orderGenerator;
    congestionManager;
    pathfinder;
    toolRegistry;
    toolExecutor;
    scoreCalculator;
    // 本地复现补丁：订单数量也由场景种子决定，避免Math.random造成同种子条件不同。
    orderCountRng;
    // 世界状态
    nodes;
    edges;
    congestionMap;
    // 模拟状态
    status;
    stats;
    // Level 0.1 特殊处理
    isLevel01;
    level01OrderCompleted = false;
    // Level 2 (V2 多模态) 特殊处理
    isLevel2;
    receiptDataManager = null;
    // Level 3 (多骑手) 特殊处理
    isLevel3;
    agentStates = new Map();
    riderCount = 1;
    /**
     * 创建模拟器实例
     *
     * @param config Level 配置
     */
    constructor(config) {
        this.config = config;
        this.orderCountRng = new SeededRNG(config.seed ^ 0x72696465);
        this.status = 'initialized';
        this.isLevel01 = config.orderCount !== undefined && config.orderCount === 1;
        this.isLevel2 = config.useRealReceiptData === true && !config.simulationRiderNum;
        this.isLevel3 = config.simulationRiderNum !== undefined && config.simulationRiderNum > 1;
        this.riderCount = config.simulationRiderNum || 1;
        // 初始化统计信息
        this.stats = {
            totalToolCalls: 0,
            invalidToolCalls: 0,
            completedOrders: 0,
            onTimeOrders: 0,
            totalProfit: 0,
            totalDistance: 0,
            batterySwaps: 0,
        };
        // 生成地图（V2/V3 模式排除超市和药店）
        const map = generateMap({
            seed: config.seed,
            size: config.mapSize,
            excludeNodeTypes: config.excludeNodeTypes,
        });
        this.nodes = map.nodes;
        this.edges = map.edges;
        // 初始化子系统
        // 从凌晨 6:00 开始，持续到第二天凌晨 6:00
        const startTime = 6 * 60; // 6:00 = 360 分钟
        const endTime = startTime + config.duration; // 结束时间 = 开始时间 + 持续时间
        this.gameClock = new GameClock(startTime, endTime);
        // 选择初始位置
        const nodeIds = Array.from(this.nodes.keys());
        if (this.isLevel3) {
            // Level 3: 创建多个骑手，分散在不同初始位置
            for (let i = 0; i < this.riderCount; i++) {
                const agentId = `agent_${i + 1}`;
                // 尽量分散初始位置，使用模运算循环选择节点
                const initialPosition = nodeIds[i % nodeIds.length];
                const agentState = new AgentState(initialPosition);
                this.agentStates.set(agentId, agentState);
            }
            // 默认 agentState 指向第一个骑手（向后兼容）
            this.agentState = this.agentStates.get('agent_1');
            console.log(`[Simulator] Level 3 mode enabled with ${this.riderCount} riders`);
        }
        else {
            // Level 0.1/1/2: 单个骑手
            const initialPosition = nodeIds[0];
            this.agentState = new AgentState(initialPosition);
            this.agentStates.set('agent_1', this.agentState);
        }
        this.orderGenerator = new OrderGenerator(config.seed);
        this.congestionManager = new CongestionManager(this.edges, this.nodes);
        this.pathfinder = new Pathfinder(this.nodes, this.edges);
        // V2/V3 模式：初始化小票数据管理器并启用 V2 模式
        if (this.isLevel2 || this.isLevel3) {
            try {
                this.receiptDataManager = createReceiptDataManager();
                this.orderGenerator.setV2Mode(true, this.receiptDataManager);
                console.log('[Simulator] V2 mode enabled with real receipt data');
            }
            catch (error) {
                console.error('[Simulator] Failed to initialize V2 mode:', error);
                if (!this.isLevel3) {
                    this.isLevel2 = false;
                }
            }
        }
        // 初始化拥堵地图（使用开始时间）
        this.congestionMap = this.congestionManager.updateCongestion(startTime);
        // 初始化工具系统
        if (this.isLevel3) {
            // V3 模式：使用多骑手版本的工具
            this.toolRegistry = createToolRegistryV3();
        }
        else {
            // V1/V2 模式
            this.toolRegistry = createToolRegistry(this.isLevel2);
        }
        this.toolExecutor = new ToolExecutor(this.toolRegistry);
        // 初始化评分计算器
        this.scoreCalculator = new ScoreCalculator();
        // 生成初始订单
        this.generateInitialOrders();
    }
    /**
     * 生成初始订单
     */
    generateInitialOrders() {
        const currentTime = this.gameClock.getCurrentTime();
        if (this.isLevel01) {
            // Level 0.1: 只生成一个订单
            const pickupNodes = Array.from(this.nodes.values()).filter(n => n.type === 'restaurant' || n.type === 'supermarket' || n.type === 'pharmacy');
            const deliveryNodes = Array.from(this.nodes.values()).filter(n => n.type === 'residential' || n.type === 'office');
            this.orderGenerator.generateOrder(currentTime, pickupNodes, deliveryNodes, (from, to) => this.calculateDistance(from, to));
        }
        else if (this.isLevel2 || this.isLevel3) {
            // Level 2/3: 使用真实小票数据，只有餐厅订单
            const pickupNodes = Array.from(this.nodes.values()).filter(n => n.type === 'restaurant');
            const deliveryNodes = Array.from(this.nodes.values()).filter(n => n.type === 'residential' || n.type === 'office');
            // Level 3 生成更多初始订单（每个骑手 3-5 个）
            const baseCount = this.isLevel3 ? this.riderCount * 3 : 5;
            const extraCount = this.isLevel3 ? this.riderCount * 2 : 5;
            const initialOrderCount = baseCount + Math.floor(this.orderCountRng.nextFloat() * extraCount);
            this.orderGenerator.generateOrders(initialOrderCount, currentTime, pickupNodes, deliveryNodes, (from, to) => this.calculateDistance(from, to));
        }
        else {
            // Level 1: 生成初始订单池
            const pickupNodes = Array.from(this.nodes.values()).filter(n => n.type === 'restaurant' || n.type === 'supermarket' || n.type === 'pharmacy');
            const deliveryNodes = Array.from(this.nodes.values()).filter(n => n.type === 'residential' || n.type === 'office');
            // 生成 5-10 个初始订单
            const initialOrderCount = 5 + Math.floor(this.orderCountRng.nextFloat() * 6);
            this.orderGenerator.generateOrders(initialOrderCount, currentTime, pickupNodes, deliveryNodes, (from, to) => this.calculateDistance(from, to));
        }
    }
    /**
     * 执行工具调用
     *
     * @param request 工具调用请求
     * @returns 工具调用响应
     */
    async executeToolCall(request) {
        this.stats.totalToolCalls++;
        // Level 3: 从参数中获取 agent_id，确定要操作哪个骑手
        let targetAgentState = this.agentState;
        if (this.isLevel3) {
            const agentId = request.parameters.agent_id;
            if (!agentId) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMETER',
                        message: 'agent_id is required in Level 3 mode',
                        details: { toolName: request.toolName },
                    },
                };
            }
            const agentState = this.agentStates.get(agentId);
            if (!agentState) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMETER',
                        message: `Invalid agent_id: ${agentId}. Available agents: ${Array.from(this.agentStates.keys()).join(', ')}`,
                        details: { agentId, availableAgents: Array.from(this.agentStates.keys()) },
                    },
                };
            }
            targetAgentState = agentState;
        }
        // 构建工具执行上下文
        const context = {
            agentState: targetAgentState,
            agentStates: this.agentStates,
            isLevel3: this.isLevel3,
            orderGenerator: this.orderGenerator,
            pathfinder: this.pathfinder,
            congestionManager: this.congestionManager,
            nodes: this.nodes,
            currentTime: this.gameClock.getCurrentTime(),
            simulator: this, // 添加 simulator 引用，用于 help 工具
            onBatterySwap: () => {
                this.stats.batterySwaps++;
            },
            onOrderComplete: (onTime, order, payment, penalty, overtime) => {
                this.stats.completedOrders++;
                if (onTime) {
                    this.stats.onTimeOrders++;
                }
                // 记录到评分计算器
                if (order && payment !== undefined && penalty !== undefined && overtime !== undefined) {
                    const optimalDistance = this.pathfinder.calculateDistance(order.pickupLocation, order.deliveryLocation)?.distance ?? 0;
                    this.scoreCalculator.recordOrderCompletion({
                        orderId: order.id,
                        orderType: order.type,
                        deliveryFee: order.deliveryFee,
                        payment,
                        penalty,
                        overtime,
                        onTime,
                        distance: order.distance,
                        optimalDistance,
                    });
                    // 在终端输出订单完成信息（用于 Web 模式）
                    this.logOrderCompletion(order, payment, penalty, overtime, onTime);
                }
                // Level 0.1: 标记订单完成
                if (this.isLevel01) {
                    this.level01OrderCompleted = true;
                }
            },
        };
        // 执行工具调用
        const response = await this.toolExecutor.execute(request, context);
        // 记录到评分计算器
        this.scoreCalculator.recordToolCall(response.success);
        // 统计无效调用
        if (!response.success) {
            this.stats.invalidToolCalls++;
        }
        // 如果操作成功，推进时间（如果有 timeCost）
        if (response.success && response.data) {
            const data = response.data;
            if (data.timeCost && typeof data.timeCost === 'number' && data.timeCost > 0) {
                this.gameClock.advance(data.timeCost);
            }
        }
        // 如果是移动操作，记录距离
        if (request.toolName === 'move_to' && response.success && response.data) {
            const moveData = response.data;
            if (moveData.distance) {
                this.scoreCalculator.recordDistance(moveData.distance);
            }
        }
        // 如果是换电操作，记录换电
        if (request.toolName === 'swap_battery' && response.success) {
            this.scoreCalculator.recordBatterySwap(0.5);
        }
        // 更新拥堵地图（使用推进后的时间）
        this.congestionMap = this.congestionManager.updateCongestion(this.gameClock.getCurrentTime());
        // 更新统计信息
        this.updateStats();
        return response;
    }
    /**
     * 批量执行工具调用
     *
     * @param requests 工具调用请求数组
     * @returns 工具调用响应数组
     */
    async executeToolCalls(requests) {
        const responses = [];
        for (const request of requests) {
            const response = await this.executeToolCall(request);
            responses.push(response);
        }
        return responses;
    }
    /**
     * 更新统计信息
     */
    updateStats() {
        if (this.isLevel3) {
            // Level 3: 汇总所有骑手的利润和距离
            let totalProfit = 0;
            let totalDistance = 0;
            for (const agentState of this.agentStates.values()) {
                totalProfit += agentState.getProfit();
                totalDistance += agentState.getTotalDistance();
            }
            this.stats.totalProfit = totalProfit;
            this.stats.totalDistance = totalDistance;
        }
        else {
            this.stats.totalProfit = this.agentState.getProfit();
            this.stats.totalDistance = this.agentState.getTotalDistance();
        }
    }
    /**
     * 检查终止条件
     *
     * @returns true 如果应该终止模拟
     */
    shouldTerminate() {
        // 检查时间是否到达终点
        if (this.gameClock.hasReachedEnd()) {
            return true;
        }
        // Level 0.1: 检查订单是否完成
        if (this.isLevel01 && this.level01OrderCompleted) {
            return true;
        }
        return false;
    }
    /**
     * 推进模拟（生成新订单等）
     *
     * 在 Level 1/2 中，应该定期调用此方法来生成新订单
     */
    advanceSimulation() {
        if (this.isLevel01) {
            // Level 0.1 不生成新订单
            return;
        }
        const currentTime = this.gameClock.getCurrentTime();
        // Level 3 生成更多订单以满足多骑手需求
        const baseOrderCount = this.isLevel3 ? this.riderCount : 1;
        const orderCount = baseOrderCount + Math.floor(this.orderCountRng.nextFloat() * 3);
        // V2/V3 模式只从餐厅生成订单
        let pickupNodes;
        if (this.isLevel2 || this.isLevel3) {
            pickupNodes = Array.from(this.nodes.values()).filter(n => n.type === 'restaurant');
        }
        else {
            pickupNodes = Array.from(this.nodes.values()).filter(n => n.type === 'restaurant' || n.type === 'supermarket' || n.type === 'pharmacy');
        }
        const deliveryNodes = Array.from(this.nodes.values()).filter(n => n.type === 'residential' || n.type === 'office');
        this.orderGenerator.generateOrders(orderCount, currentTime, pickupNodes, deliveryNodes, (from, to) => this.calculateDistance(from, to));
        // 移除过期订单
        this.orderGenerator.removeExpiredOrders(currentTime);
    }
    /**
     * 计算两点间距离（辅助方法）
     */
    calculateDistance(from, to) {
        const result = this.pathfinder.calculateDistance(from, to);
        return result ? result.distance : 0;
    }
    // ============================================================================
    // 状态查询方法
    // ============================================================================
    /**
     * 获取当前游戏时间
     */
    getCurrentTime() {
        return this.gameClock.getCurrentTime();
    }
    /**
     * 获取格式化的当前时间
     */
    getFormattedTime() {
        return this.gameClock.getFormattedTime();
    }
    /**
     * 获取智能体状态
     */
    getAgentState() {
        return this.agentState;
    }
    /**
     * 获取世界状态
     */
    getWorldState() {
        return {
            nodes: this.nodes,
            edges: this.edges,
            currentTime: this.gameClock.getCurrentTime(),
            seed: this.config.seed,
            congestionMap: this.congestionMap,
        };
    }
    /**
     * 获取可用订单列表
     */
    getAvailableOrders() {
        return this.orderGenerator.getAvailableOrders();
    }
    /**
     * 获取统计信息
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * 获取评分计算器
     */
    getScoreCalculator() {
        return this.scoreCalculator;
    }
    /**
     * 获取模拟器状态
     */
    getStatus() {
        return this.status;
    }
    /**
     * 设置模拟器状态
     */
    setStatus(status) {
        this.status = status;
    }
    /**
     * 获取配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 获取路径查找器
     */
    getPathfinder() {
        return this.pathfinder;
    }
    /**
     * 获取拥堵管理器
     */
    getCongestionManager() {
        return this.congestionManager;
    }
    /**
     * 获取工具注册表
     */
    getToolRegistry() {
        return this.toolRegistry;
    }
    /**
     * 获取游戏时钟
     */
    getGameClock() {
        return this.gameClock;
    }
    /**
     * 获取节点信息
     */
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }
    /**
     * 获取所有节点
     */
    getNodes() {
        return this.nodes;
    }
    /**
     * 获取所有边
     */
    getEdges() {
        return this.edges;
    }
    /**
     * 是否是 Level 0.1
     */
    isLevel01Mode() {
        return this.isLevel01;
    }
    /**
     * 是否是 Level 2 (V2 多模态模式)
     */
    isLevel2Mode() {
        return this.isLevel2;
    }
    /**
     * 是否是 Level 3 (多骑手模式)
     */
    isLevel3Mode() {
        return this.isLevel3;
    }
    /**
     * 获取骑手数量
     */
    getRiderCount() {
        return this.riderCount;
    }
    /**
     * 根据 ID 获取指定骑手状态
     * @param agentId 骑手 ID（如 agent_1, agent_2）
     */
    getAgentStateById(agentId) {
        return this.agentStates.get(agentId);
    }
    /**
     * 获取所有骑手状态
     */
    getAllAgentStates() {
        return this.agentStates;
    }
    /**
     * 获取所有骑手 ID 列表
     */
    getAgentIds() {
        return Array.from(this.agentStates.keys());
    }
    /**
     * 获取所有骑手利润汇总
     */
    getTotalProfit() {
        if (this.isLevel3) {
            let totalProfit = 0;
            for (const agentState of this.agentStates.values()) {
                totalProfit += agentState.getProfit();
            }
            return totalProfit;
        }
        return this.agentState.getProfit();
    }
    /**
     * 获取小票数据管理器（V2/V3 模式）
     */
    getReceiptDataManager() {
        return this.receiptDataManager;
    }
    /**
     * 计算最终评分
     */
    calculateFinalScore() {
        const onTimeRate = this.stats.completedOrders > 0
            ? this.stats.onTimeOrders / this.stats.completedOrders
            : 0;
        const apiViolationRate = this.stats.totalToolCalls > 0
            ? this.stats.invalidToolCalls / this.stats.totalToolCalls
            : 0;
        // 路径效率需要更复杂的计算，这里简化为 1.0
        const pathEfficiency = 1.0;
        return {
            profit: this.stats.totalProfit,
            onTimeRate,
            pathEfficiency,
            apiViolationRate,
        };
    }
    /**
     * 记录订单完成信息到终端（用于 Web 模式）
     */
    logOrderCompletion(order, payment, penalty, overtime, onTime) {
        // 只在非调试模式下输出（避免与 AI 客户端的详细日志冲突）
        if (process.env.DEBUG === 'true') {
            return;
        }
        const statusIcon = onTime ? '✅' : '⏰';
        const statusText = onTime ? '准时完成' : `超时${overtime.toFixed(1)}分钟`;
        const orderTypeEmoji = this.getOrderTypeEmoji(order.type);
        console.log('\n' + '─'.repeat(70));
        console.log(`${statusIcon} 订单完成: ${order.id} ${orderTypeEmoji}`);
        console.log(`   配送费: ¥${order.deliveryFee.toFixed(2)}`);
        console.log(`   实际收入: ¥${payment.toFixed(2)}`);
        if (penalty > 0) {
            console.log(`   超时罚款: -¥${penalty.toFixed(2)}`);
        }
        console.log(`   状态: ${statusText}`);
        console.log('─'.repeat(70));
    }
    /**
     * 获取订单类型的 emoji
     */
    getOrderTypeEmoji(type) {
        switch (type) {
            case 'food':
                return '🍔';
            case 'supermarket':
                return '🛒';
            case 'pharmacy':
                return '💊';
            default:
                return '📦';
        }
    }
    /**
     * 生成报告摘要
     */
    generateReportSummary() {
        const score = this.calculateFinalScore();
        const duration = this.gameClock.getElapsedTime();
        // 确定 Level 标识
        let levelStr = '1';
        if (this.isLevel01)
            levelStr = '0.1';
        else if (this.isLevel2)
            levelStr = '2';
        else if (this.isLevel3)
            levelStr = '3';
        let report = `
# Silicon Rider Bench - 评测报告

## 基本信息
- Level: ${levelStr}
- Seed: ${this.config.seed}
- Duration: ${GameClock.formatTime(duration)}`;
        if (this.isLevel3) {
            report += `
- 骑手数量: ${this.riderCount}`;
        }
        report += `

## 核心指标
- **总利润**: ¥${score.profit.toFixed(2)}
- **完成订单数**: ${this.stats.completedOrders}
- **准时率**: ${(score.onTimeRate * 100).toFixed(1)}% (${this.stats.onTimeOrders}/${this.stats.completedOrders})
- **路径效率**: ${score.pathEfficiency.toFixed(2)}
- **API 违规率**: ${(score.apiViolationRate * 100).toFixed(1)}% (${this.stats.invalidToolCalls}/${this.stats.totalToolCalls})

## 详细统计
- 总行驶距离: ${this.stats.totalDistance.toFixed(1)} km
- 换电次数: ${this.stats.batterySwaps}
- 平均每单利润: ¥${this.stats.completedOrders > 0 ? (score.profit / this.stats.completedOrders).toFixed(2) : '0.00'}
- 超时订单数: ${this.stats.completedOrders - this.stats.onTimeOrders}`;
        // Level 3: 添加每个骑手的详细统计
        if (this.isLevel3) {
            report += `

## 各骑手统计`;
            for (const [agentId, agentState] of this.agentStates) {
                report += `

### ${agentId}
- 位置: ${agentState.getPosition()}
- 利润: ¥${agentState.getProfit().toFixed(2)}
- 完成订单: ${agentState.getCompletedOrders()}
- 行驶距离: ${agentState.getTotalDistance().toFixed(1)} km
- 电量: ${agentState.getBattery()}%`;
            }
        }
        return report.trim();
    }
}
//# sourceMappingURL=simulator.js.map