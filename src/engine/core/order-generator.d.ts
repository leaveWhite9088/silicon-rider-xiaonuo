/**
 * 订单生成系统
 * 负责根据时间、订单潮汐规则生成订单，并管理订单池
 */
import { Order, Node } from '../types';
import { ReceiptDataManager } from '../data/receipt-data-manager';
/**
 * 订单生成器类
 */
export declare class OrderGenerator {
    private rng;
    private orderCounter;
    private availableOrders;
    private acceptedOrders;
    private v2Mode;
    private receiptDataManager;
    private tideRules;
    private foodSelector;
    constructor(seed: number);
    /**
     * Enable V2 mode with real receipt data
     */
    setV2Mode(enabled: boolean, dataManager?: ReceiptDataManager): void;
    /**
     * Check if V2 mode is enabled
     */
    isV2Mode(): boolean;
    /**
     * Get the receipt data manager (for V2 mode)
     */
    getReceiptDataManager(): ReceiptDataManager | null;
    /**
     * 计算当前时间的订单生成频率倍数
     * 需求：18.1-18.6
     */
    private getOrderFrequencyMultiplier;
    /**
     * 生成订单类型
     * 根据当前时间和潮汐规则选择订单类型
     */
    private generateOrderType;
    /**
     * 生成订单重量
     * 需求：19.1, 19.2, 19.4
     */
    private generateOrderWeight;
    /**
     * 生成商品价格
     */
    private generateItemPrice;
    /**
     * 计算配送时限
     * 需求：21.1, 21.2
     */
    private calculateTimeLimit;
    /**
     * 生成单个订单
     */
    generateOrder(currentTime: number, pickupNodes: Node[], deliveryNodes: Node[], distanceCalculator: (from: string, to: string) => number): Order | null;
    /**
     * Generate V1 order (original random generation)
     */
    private generateV1Order;
    /**
     * Generate V2 order using real receipt data
     */
    private generateV2Order;
    /**
     * 批量生成订单
     */
    generateOrders(count: number, currentTime: number, pickupNodes: Node[], deliveryNodes: Node[], distanceCalculator: (from: string, to: string) => number): Order[];
    /**
     * 获取可用订单列表
     */
    getAvailableOrders(): Order[];
    /**
     * 获取指定订单
     */
    getOrder(orderId: string): Order | undefined;
    /**
     * 接受订单（从可用订单池中移除）
     */
    acceptOrder(orderId: string, acceptTime: number): Order | undefined;
    /**
     * 移除过期订单
     * 如果订单在可用池中存在时间超过其 timeLimit，则视为过期并移除
     * 这样可以避免 AI 接到已经超时的订单
     */
    removeExpiredOrders(currentTime: number): void;
    /**
     * Notify that an order has been completed (for V2 mode to release the ID)
     */
    notifyOrderCompleted(orderId: string): void;
    /**
     * 搜索附近的订单
     */
    searchNearbyOrders(agentPosition: string, radius: number, distanceCalculator: (from: string, to: string) => number): Order[];
    /**
     * 清空订单池（用于测试）
     */
    clear(): void;
}
//# sourceMappingURL=order-generator.d.ts.map