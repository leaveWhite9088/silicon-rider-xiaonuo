/**
 * 智能体状态管理
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：4.1-4.5, 6.2, 6.3, 20.1-20.4
 */
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
export class AgentState {
    state;
    agentId;
    modelName;
    // 常量
    static MAX_ORDERS = 5; // 最大订单数量
    static MAX_WEIGHT = 10; // 最大承载重量（kg）
    static MAX_BATTERY_RANGE = 50; // 满电续航（km）
    /**
     * 初始化智能体状态
     * @param initialPosition 初始位置节点 ID
     * @param agentId 代理 ID（可选，默认为 'default'）
     * @param modelName 模型名称（可选，默认为 'unknown'）
     */
    constructor(initialPosition, agentId = 'default', modelName = 'unknown') {
        this.agentId = agentId;
        this.modelName = modelName;
        this.state = {
            position: initialPosition,
            battery: 100,
            carriedOrders: [],
            totalWeight: 0,
            profit: 0,
            completedOrders: 0,
            totalDistance: 0,
        };
    }
    /**
     * 获取代理 ID
     */
    getAgentId() {
        return this.agentId;
    }
    /**
     * 获取模型名称
     */
    getModelName() {
        return this.modelName;
    }
    // ============================================================================
    // 状态查询方法
    // ============================================================================
    /**
     * 获取当前位置
     * 需求：4.1
     */
    getPosition() {
        return this.state.position;
    }
    /**
     * 获取当前电量百分比
     * 需求：4.4
     */
    getBattery() {
        return this.state.battery;
    }
    /**
     * 获取电池剩余续航（km）
     * 需求：10.5
     */
    getBatteryRange() {
        return (this.state.battery / 100) * AgentState.MAX_BATTERY_RANGE;
    }
    /**
     * 获取携带的订单列表
     * 需求：4.2
     */
    getCarriedOrders() {
        return [...this.state.carriedOrders];
    }
    /**
     * 获取当前总携带重量
     * 需求：4.3, 20.1
     */
    getTotalWeight() {
        return this.state.totalWeight;
    }
    /**
     * 获取剩余承载能力
     * 需求：4.3
     */
    getRemainingCapacity() {
        return AgentState.MAX_WEIGHT - this.state.totalWeight;
    }
    /**
     * 获取当前利润
     */
    getProfit() {
        return this.state.profit;
    }
    /**
     * 获取已完成订单数
     */
    getCompletedOrders() {
        return this.state.completedOrders;
    }
    /**
     * 获取总行驶距离
     */
    getTotalDistance() {
        return this.state.totalDistance;
    }
    /**
     * 获取完整状态（用于工具调用）
     * 需求：4.1-4.5
     */
    getState() {
        return {
            position: this.state.position,
            battery: this.state.battery,
            carriedOrders: [...this.state.carriedOrders],
            totalWeight: this.state.totalWeight,
            profit: this.state.profit,
            completedOrders: this.state.completedOrders,
            totalDistance: this.state.totalDistance,
        };
    }
    // ============================================================================
    // 承载能力检查
    // ============================================================================
    /**
     * 检查是否可以接受新订单（订单数量限制）
     * 需求：6.2
     * @returns true 如果可以接受，false 如果已达上限
     */
    canAcceptOrderByCount() {
        return this.state.carriedOrders.length < AgentState.MAX_ORDERS;
    }
    /**
     * 检查是否可以接受新订单（重量限制）
     * 需求：6.3, 20.2
     * @param orderWeight 新订单的重量
     * @returns true 如果可以接受，false 如果超重
     */
    canAcceptOrderByWeight(orderWeight) {
        return this.state.totalWeight + orderWeight <= AgentState.MAX_WEIGHT;
    }
    /**
     * 检查是否可以接受新订单（综合检查）
     * 需求：6.2, 6.3
     * @param orderWeight 新订单的重量
     * @returns { canAccept: boolean, reason?: string }
     */
    canAcceptOrder(orderWeight) {
        if (!this.canAcceptOrderByCount()) {
            return {
                canAccept: false,
                reason: `订单数量已达上限（${AgentState.MAX_ORDERS}单）`,
            };
        }
        if (!this.canAcceptOrderByWeight(orderWeight)) {
            return {
                canAccept: false,
                reason: `承载重量将超过限制（当前：${this.state.totalWeight}kg，新订单：${orderWeight}kg，限制：${AgentState.MAX_WEIGHT}kg）`,
            };
        }
        return { canAccept: true };
    }
    /**
     * 根据订单 ID 查找携带的订单
     * @param orderId 订单 ID
     * @returns 订单对象或 undefined
     */
    findCarriedOrder(orderId) {
        return this.state.carriedOrders.find(order => order.id === orderId);
    }
    // ============================================================================
    // 状态更新方法
    // ============================================================================
    /**
     * 更新位置
     * 需求：7.1
     * @param newPosition 新位置节点 ID
     */
    updatePosition(newPosition) {
        this.state.position = newPosition;
    }
    /**
     * 更新电量
     * 需求：7.3, 10.1
     * @param newBattery 新电量百分比（0-100）
     */
    updateBattery(newBattery) {
        this.state.battery = Math.max(0, Math.min(100, newBattery));
    }
    /**
     * 消耗电量
     * 需求：7.3
     * @param batteryCost 消耗的电量百分比
     */
    consumeBattery(batteryCost) {
        this.state.battery = Math.max(0, this.state.battery - batteryCost);
    }
    /**
     * 添加订单到携带列表
     * 需求：6.1
     * @param order 订单对象
     */
    addOrder(order) {
        this.state.carriedOrders.push(order);
        this.state.totalWeight += order.weight;
    }
    /**
     * 从携带列表中移除订单
     * 需求：9.5, 20.4
     * @param orderId 订单 ID
     * @returns 被移除的订单，如果不存在则返回 undefined
     */
    removeOrder(orderId) {
        const index = this.state.carriedOrders.findIndex(order => order.id === orderId);
        if (index === -1) {
            return undefined;
        }
        const removedOrder = this.state.carriedOrders.splice(index, 1)[0];
        this.state.totalWeight -= removedOrder.weight;
        // 确保重量不会因为浮点数精度问题变成负数
        if (this.state.totalWeight < 0.001) {
            this.state.totalWeight = 0;
        }
        return removedOrder;
    }
    /**
     * 更新订单状态（取餐）
     * 需求：8.1
     * @param orderId 订单 ID
     * @returns true 如果成功，false 如果订单不存在
     */
    markOrderPickedUp(orderId) {
        const order = this.findCarriedOrder(orderId);
        if (!order) {
            return false;
        }
        order.pickedUp = true;
        return true;
    }
    /**
     * 增加利润
     * @param amount 金额（可以是负数，表示成本）
     */
    addProfit(amount) {
        this.state.profit += amount;
    }
    /**
     * 扣除成本
     * @param amount 金额
     */
    deductCost(amount) {
        this.state.profit -= amount;
    }
    /**
     * 增加已完成订单数
     */
    incrementCompletedOrders() {
        this.state.completedOrders += 1;
    }
    /**
     * 增加总行驶距离
     * @param distance 距离（km）
     */
    addDistance(distance) {
        this.state.totalDistance += distance;
    }
    // ============================================================================
    // 静态常量访问器
    // ============================================================================
    /**
     * 获取最大订单数量限制
     */
    static getMaxOrders() {
        return AgentState.MAX_ORDERS;
    }
    /**
     * 获取最大承载重量限制
     */
    static getMaxWeight() {
        return AgentState.MAX_WEIGHT;
    }
    /**
     * 获取满电续航距离
     */
    static getMaxBatteryRange() {
        return AgentState.MAX_BATTERY_RANGE;
    }
}
//# sourceMappingURL=agent-state.js.map