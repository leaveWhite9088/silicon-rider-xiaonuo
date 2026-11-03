/**
 * 智能体状态管理
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：4.1-4.5, 6.2, 6.3, 20.1-20.4
 */
import { Order, AgentState as IAgentState } from '../types';
/**
 * 智能体状态管理类
 *
 * 负责管理智能体的所有状态信息，包括：
 * - 位置
 * - 电量
 * - 携带订单
 * - 利润
 * - 统计信息
 */
export declare class AgentState {
    private state;
    private readonly agentId;
    private readonly modelName;
    private static readonly MAX_ORDERS;
    private static readonly MAX_WEIGHT;
    private static readonly MAX_BATTERY_RANGE;
    /**
     * 初始化智能体状态
     * @param initialPosition 初始位置节点 ID
     * @param agentId 代理 ID（可选，默认为 'default'）
     * @param modelName 模型名称（可选，默认为 'unknown'）
     */
    constructor(initialPosition: string, agentId?: string, modelName?: string);
    /**
     * 获取代理 ID
     */
    getAgentId(): string;
    /**
     * 获取模型名称
     */
    getModelName(): string;
    /**
     * 获取当前位置
     * 需求：4.1
     */
    getPosition(): string;
    /**
     * 获取当前电量百分比
     * 需求：4.4
     */
    getBattery(): number;
    /**
     * 获取电池剩余续航（km）
     * 需求：10.5
     */
    getBatteryRange(): number;
    /**
     * 获取携带的订单列表
     * 需求：4.2
     */
    getCarriedOrders(): Order[];
    /**
     * 获取当前总携带重量
     * 需求：4.3, 20.1
     */
    getTotalWeight(): number;
    /**
     * 获取剩余承载能力
     * 需求：4.3
     */
    getRemainingCapacity(): number;
    /**
     * 获取当前利润
     */
    getProfit(): number;
    /**
     * 获取已完成订单数
     */
    getCompletedOrders(): number;
    /**
     * 获取总行驶距离
     */
    getTotalDistance(): number;
    /**
     * 获取完整状态（用于工具调用）
     * 需求：4.1-4.5
     */
    getState(): IAgentState;
    /**
     * 检查是否可以接受新订单（订单数量限制）
     * 需求：6.2
     * @returns true 如果可以接受，false 如果已达上限
     */
    canAcceptOrderByCount(): boolean;
    /**
     * 检查是否可以接受新订单（重量限制）
     * 需求：6.3, 20.2
     * @param orderWeight 新订单的重量
     * @returns true 如果可以接受，false 如果超重
     */
    canAcceptOrderByWeight(orderWeight: number): boolean;
    /**
     * 检查是否可以接受新订单（综合检查）
     * 需求：6.2, 6.3
     * @param orderWeight 新订单的重量
     * @returns { canAccept: boolean, reason?: string }
     */
    canAcceptOrder(orderWeight: number): {
        canAccept: boolean;
        reason?: string;
    };
    /**
     * 根据订单 ID 查找携带的订单
     * @param orderId 订单 ID
     * @returns 订单对象或 undefined
     */
    findCarriedOrder(orderId: string): Order | undefined;
    /**
     * 更新位置
     * 需求：7.1
     * @param newPosition 新位置节点 ID
     */
    updatePosition(newPosition: string): void;
    /**
     * 更新电量
     * 需求：7.3, 10.1
     * @param newBattery 新电量百分比（0-100）
     */
    updateBattery(newBattery: number): void;
    /**
     * 消耗电量
     * 需求：7.3
     * @param batteryCost 消耗的电量百分比
     */
    consumeBattery(batteryCost: number): void;
    /**
     * 添加订单到携带列表
     * 需求：6.1
     * @param order 订单对象
     */
    addOrder(order: Order): void;
    /**
     * 从携带列表中移除订单
     * 需求：9.5, 20.4
     * @param orderId 订单 ID
     * @returns 被移除的订单，如果不存在则返回 undefined
     */
    removeOrder(orderId: string): Order | undefined;
    /**
     * 更新订单状态（取餐）
     * 需求：8.1
     * @param orderId 订单 ID
     * @returns true 如果成功，false 如果订单不存在
     */
    markOrderPickedUp(orderId: string): boolean;
    /**
     * 增加利润
     * @param amount 金额（可以是负数，表示成本）
     */
    addProfit(amount: number): void;
    /**
     * 扣除成本
     * @param amount 金额
     */
    deductCost(amount: number): void;
    /**
     * 增加已完成订单数
     */
    incrementCompletedOrders(): void;
    /**
     * 增加总行驶距离
     * @param distance 距离（km）
     */
    addDistance(distance: number): void;
    /**
     * 获取最大订单数量限制
     */
    static getMaxOrders(): number;
    /**
     * 获取最大承载重量限制
     */
    static getMaxWeight(): number;
    /**
     * 获取满电续航距离
     */
    static getMaxBatteryRange(): number;
}
//# sourceMappingURL=agent-state.d.ts.map