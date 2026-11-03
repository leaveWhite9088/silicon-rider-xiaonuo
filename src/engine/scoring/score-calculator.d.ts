/**
 * 评分计算器
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：14.1-14.4
 */
/**
 * 订单完成记录
 */
export interface OrderCompletionRecord {
    orderId: string;
    orderType: string;
    deliveryFee: number;
    payment: number;
    penalty: number;
    overtime: number;
    onTime: boolean;
    distance: number;
    optimalDistance: number;
}
/**
 * 评分指标
 */
export interface ScoreMetrics {
    totalProfit: number;
    onTimeRate: number;
    pathEfficiency: number;
    apiViolationRate: number;
    completedOrders: number;
    onTimeOrders: number;
    totalDistance: number;
    optimalDistance: number;
    totalToolCalls: number;
    invalidToolCalls: number;
    batterySwaps: number;
    totalRevenue: number;
    totalPenalty: number;
    totalCost: number;
    foodOrders: number;
    supermarketOrders: number;
    pharmacyOrders: number;
    averageProfit: number;
    averageOvertime: number;
}
/**
 * 评分计算器类
 *
 * 负责跟踪和计算所有评分指标
 */
export declare class ScoreCalculator {
    private completionRecords;
    private totalToolCalls;
    private invalidToolCalls;
    private totalDistance;
    private optimalDistance;
    private batterySwaps;
    private totalCost;
    /**
     * 记录订单完成
     *
     * @param record 订单完成记录
     */
    recordOrderCompletion(record: OrderCompletionRecord): void;
    /**
     * 记录工具调用
     *
     * @param isValid 是否有效
     */
    recordToolCall(isValid: boolean): void;
    /**
     * 记录移动距离
     *
     * @param distance 距离（km）
     */
    recordDistance(distance: number): void;
    /**
     * 记录换电
     *
     * @param cost 换电成本
     */
    recordBatterySwap(cost: number): void;
    /**
     * 记录其他成本
     *
     * @param cost 成本金额
     */
    recordCost(cost: number): void;
    /**
     * 计算总利润
     * 需求：14.1
     *
     * 总利润 = 所有订单支付之和 - 罚款 - 成本
     *
     * @returns 总利润
     */
    calculateTotalProfit(): number;
    /**
     * 计算准时率
     * 需求：14.2
     *
     * 准时率 = 准时配送数 / 总配送数
     *
     * @returns 准时率（0-1）
     */
    calculateOnTimeRate(): number;
    /**
     * 计算路径效率
     * 需求：14.3
     *
     * 路径效率 = 实际行驶距离 / 理论最优距离
     *
     * @returns 路径效率（≥1.0，越接近1.0越好）
     */
    calculatePathEfficiency(): number;
    /**
     * 计算 API 违规率
     * 需求：14.4
     *
     * API 违规率 = 无效工具调用数 / 总工具调用数
     *
     * @returns API 违规率（0-1）
     */
    calculateApiViolationRate(): number;
    /**
     * 计算完整的评分指标
     *
     * @returns 所有评分指标
     */
    calculateMetrics(): ScoreMetrics;
    /**
     * 获取订单完成记录
     */
    getCompletionRecords(): OrderCompletionRecord[];
    /**
     * 重置所有统计数据
     */
    reset(): void;
}
//# sourceMappingURL=score-calculator.d.ts.map