/**
 * 订单生成系统
 * 负责根据时间、订单潮汐规则生成订单，并管理订单池
 */
import { SeededRNG } from '../utils/seeded-rng';
import { calculateTotalFee } from './fee-calculator';
import { FoodSelector } from '../data/food-selector';
/**
 * 订单生成器类
 */
export class OrderGenerator {
    rng;
    orderCounter = 0;
    availableOrders = new Map();
    acceptedOrders = new Set();
    // V2 mode settings
    v2Mode = false;
    receiptDataManager = null;
    // 订单潮汐规则
    tideRules = [
        // 早高峰（6:00-9:00）：餐饮 ×3
        { startHour: 6, endHour: 9, orderType: 'food', multiplier: 3 },
        // 午高峰（10:30-12:30）：餐饮 ×4
        { startHour: 10.5, endHour: 12.5, orderType: 'food', multiplier: 4 },
        // 下午小高峰（15:00-17:00）：超市 ×3
        { startHour: 15, endHour: 17, orderType: 'supermarket', multiplier: 3 },
        // 晚高峰（18:00-20:00）：餐饮 ×4
        { startHour: 18, endHour: 20, orderType: 'food', multiplier: 4 },
        // 夜宵（21:00-24:00）：餐饮 ×2
        { startHour: 21, endHour: 24, orderType: 'food', multiplier: 2 },
        // 深夜（0:00-6:00）：药店 ×2
        { startHour: 0, endHour: 6, orderType: 'pharmacy', multiplier: 2 },
    ];
    foodSelector;
    constructor(seed) {
        this.rng = new SeededRNG(seed);
        // 名称独立使用种子，不改变订单价格、重量与地点的随机序列。
        const nameRng = new SeededRNG(seed ^ 0x666f6f64);
        this.foodSelector = new FoodSelector(() => nameRng.nextFloat());
    }
    /**
     * Enable V2 mode with real receipt data
     */
    setV2Mode(enabled, dataManager) {
        this.v2Mode = enabled;
        this.receiptDataManager = dataManager || null;
        if (enabled) {
            console.log('[OrderGenerator] V2 mode enabled - using real receipt data');
        }
    }
    /**
     * Check if V2 mode is enabled
     */
    isV2Mode() {
        return this.v2Mode;
    }
    /**
     * Get the receipt data manager (for V2 mode)
     */
    getReceiptDataManager() {
        return this.receiptDataManager;
    }
    /**
     * 计算当前时间的订单生成频率倍数
     * 需求：18.1-18.6
     */
    getOrderFrequencyMultiplier(currentTime, orderType) {
        const hour = currentTime / 60;
        for (const rule of this.tideRules) {
            if (hour >= rule.startHour && hour < rule.endHour && rule.orderType === orderType) {
                return rule.multiplier;
            }
        }
        // 深夜时段降低非药店订单频率
        if (hour >= 0 && hour < 6 && orderType !== 'pharmacy') {
            return 0.5;
        }
        return 1;
    }
    /**
     * 生成订单类型
     * 根据当前时间和潮汐规则选择订单类型
     */
    generateOrderType(currentTime) {
        const hour = currentTime / 60;
        // 深夜时段主要生成药店订单
        if (hour >= 0 && hour < 6) {
            return this.rng.nextFloat() < 0.7 ? 'pharmacy' : 'food';
        }
        // 根据时段权重选择订单类型
        const weights = {
            food: 0.7,
            supermarket: 0.2,
            pharmacy: 0.1,
        };
        // 应用潮汐倍数调整权重
        const foodMultiplier = this.getOrderFrequencyMultiplier(currentTime, 'food');
        const supermarketMultiplier = this.getOrderFrequencyMultiplier(currentTime, 'supermarket');
        const pharmacyMultiplier = this.getOrderFrequencyMultiplier(currentTime, 'pharmacy');
        weights.food *= foodMultiplier;
        weights.supermarket *= supermarketMultiplier;
        weights.pharmacy *= pharmacyMultiplier;
        const total = weights.food + weights.supermarket + weights.pharmacy;
        const rand = this.rng.nextFloat() * total;
        if (rand < weights.food) {
            return 'food';
        }
        else if (rand < weights.food + weights.supermarket) {
            return 'supermarket';
        }
        else {
            return 'pharmacy';
        }
    }
    /**
     * 生成订单重量
     * 需求：19.1, 19.2, 19.4
     */
    generateOrderWeight(orderType) {
        switch (orderType) {
            case 'food':
                // 餐饮订单：0.5-1kg
                return this.rng.nextFloatRange(0.5, 1);
            case 'supermarket':
                // 超市订单：5-10kg
                return this.rng.nextFloatRange(5, 10);
            case 'pharmacy':
                // 药店订单：0.05-0.2kg
                return this.rng.nextFloatRange(0.05, 0.2);
        }
    }
    /**
     * 生成商品价格
     */
    generateItemPrice(orderType) {
        switch (orderType) {
            case 'food':
                return this.rng.nextFloatRange(15, 80);
            case 'supermarket':
                return this.rng.nextFloatRange(30, 150);
            case 'pharmacy':
                return this.rng.nextFloatRange(10, 100);
        }
    }
    /**
     * 计算配送时限
     * 需求：21.1, 21.2
     */
    calculateTimeLimit(distance) {
        if (distance < 3) {
            // 距离小于 3km：20 分钟
            return 20;
        }
        else {
            // 距离大于等于 3km：20 分钟 + 超出 3km 部分每公里 3 分钟
            return 20 + (distance - 3) * 3;
        }
    }
    /**
     * 生成单个订单
     */
    generateOrder(currentTime, pickupNodes, deliveryNodes, distanceCalculator) {
        // V2 mode: use real receipt data
        if (this.v2Mode) {
            return this.generateV2Order(currentTime, pickupNodes, deliveryNodes, distanceCalculator);
        }
        // V1 mode: original random generation logic
        return this.generateV1Order(currentTime, pickupNodes, deliveryNodes, distanceCalculator);
    }
    /**
     * Generate V1 order (original random generation)
     */
    generateV1Order(currentTime, pickupNodes, deliveryNodes, distanceCalculator) {
        const orderType = this.generateOrderType(currentTime);
        // 根据订单类型选择取餐点
        let pickupNode;
        if (orderType === 'food') {
            const restaurants = pickupNodes.filter(n => n.type === 'restaurant');
            pickupNode = this.rng.choice(restaurants.length > 0 ? restaurants : pickupNodes);
        }
        else if (orderType === 'supermarket') {
            const supermarkets = pickupNodes.filter(n => n.type === 'supermarket');
            pickupNode = this.rng.choice(supermarkets.length > 0 ? supermarkets : pickupNodes);
        }
        else {
            const pharmacies = pickupNodes.filter(n => n.type === 'pharmacy');
            pickupNode = this.rng.choice(pharmacies.length > 0 ? pharmacies : pickupNodes);
        }
        // 选择送餐点（居民区或写字楼）
        const deliveryNodeCandidates = deliveryNodes.filter(n => n.type === 'residential' || n.type === 'office');
        const deliveryNode = this.rng.choice(deliveryNodeCandidates.length > 0 ? deliveryNodeCandidates : deliveryNodes);
        // 计算距离
        const distance = distanceCalculator(pickupNode.id, deliveryNode.id);
        // 生成订单属性
        const weight = this.generateOrderWeight(orderType);
        const itemPrice = this.generateItemPrice(orderType);
        const timeLimit = this.calculateTimeLimit(distance);
        // 注意：配送费在接单时才计算时段费，这里先用 0 作为接单时间
        const deliveryFee = calculateTotalFee(distance, itemPrice, 0);
        // 生成订单名称
        const foodSelector = this.foodSelector;
        const name = foodSelector.selectFoodName(orderType, weight, itemPrice);
        const order = {
            id: `order_${++this.orderCounter}`,
            type: orderType,
            name,
            pickupLocation: pickupNode.id,
            deliveryLocation: deliveryNode.id,
            distance,
            itemPrice,
            deliveryFee,
            weight,
            timeLimit,
            createdAt: currentTime, // Record order creation time
            pickedUp: false,
            delivered: false,
        };
        this.availableOrders.set(order.id, order);
        return order;
    }
    /**
     * Generate V2 order using real receipt data
     */
    generateV2Order(currentTime, pickupNodes, deliveryNodes, distanceCalculator) {
        if (!this.receiptDataManager) {
            console.error('[OrderGenerator] V2 mode enabled but no receipt data manager available');
            return null;
        }
        // Get next available receipt data
        const receiptData = this.receiptDataManager.getNextAvailableOrder();
        if (!receiptData) {
            console.warn('[OrderGenerator] No available receipt data (all orders in use)');
            return null;
        }
        // V2 mode only generates food orders (restaurants)
        const orderType = 'food';
        const restaurants = pickupNodes.filter(n => n.type === 'restaurant');
        if (restaurants.length === 0) {
            console.error('[OrderGenerator] No restaurants available for V2 order');
            this.receiptDataManager.markOrderExpired(`#${receiptData.order_id}`);
            return null;
        }
        const pickupNode = this.rng.choice(restaurants);
        // 选择送餐点（居民区或写字楼）
        const deliveryNodeCandidates = deliveryNodes.filter(n => n.type === 'residential' || n.type === 'office');
        const deliveryNode = this.rng.choice(deliveryNodeCandidates.length > 0 ? deliveryNodeCandidates : deliveryNodes);
        // 计算距离
        const distance = distanceCalculator(pickupNode.id, deliveryNode.id);
        // Use data from receipt
        const itemPrice = receiptData.total_price;
        const timeLimit = this.calculateTimeLimit(distance);
        // Generate weight based on food order type (0.5-1kg)
        const weight = this.rng.nextFloatRange(0.5, 1);
        // Delivery fee is still randomly generated
        const deliveryFee = calculateTotalFee(distance, itemPrice, 0);
        // Build order name from food items
        const foodNames = receiptData.food_items.map(item => item.name);
        const name = foodNames.length > 2
            ? `${foodNames.slice(0, 2).join('、')}等${foodNames.length}样`
            : foodNames.join('、');
        const order = {
            id: `#${receiptData.order_id}`, // Use dataset format: #0001, #0002, etc.
            type: orderType,
            name,
            pickupLocation: pickupNode.id,
            deliveryLocation: deliveryNode.id,
            distance,
            itemPrice,
            deliveryFee,
            weight,
            timeLimit,
            createdAt: currentTime,
            pickedUp: false,
            delivered: false,
            // V2 specific fields
            phoneNumber: receiptData.phone_number,
            receiptImagePath: receiptData.image_filename,
            foodItems: receiptData.food_items,
        };
        this.availableOrders.set(order.id, order);
        console.log(`[OrderGenerator] Generated V2 order: ${order.id}`);
        return order;
    }
    /**
     * 批量生成订单
     */
    generateOrders(count, currentTime, pickupNodes, deliveryNodes, distanceCalculator) {
        const orders = [];
        for (let i = 0; i < count; i++) {
            const order = this.generateOrder(currentTime, pickupNodes, deliveryNodes, distanceCalculator);
            if (order) {
                orders.push(order);
            }
        }
        return orders;
    }
    /**
     * 获取可用订单列表
     */
    getAvailableOrders() {
        return Array.from(this.availableOrders.values());
    }
    /**
     * 获取指定订单
     */
    getOrder(orderId) {
        return this.availableOrders.get(orderId);
    }
    /**
     * 接受订单（从可用订单池中移除）
     */
    acceptOrder(orderId, acceptTime) {
        const order = this.availableOrders.get(orderId);
        if (!order) {
            return undefined;
        }
        // 更新订单的接单时间和截止时间
        order.acceptedAt = acceptTime;
        order.deadline = acceptTime + order.timeLimit;
        // 重新计算配送费（包含时段费）
        order.deliveryFee = calculateTotalFee(order.distance, order.itemPrice, acceptTime);
        // 从可用订单池中移除
        this.availableOrders.delete(orderId);
        this.acceptedOrders.add(orderId);
        return order;
    }
    /**
     * 移除过期订单
     * 如果订单在可用池中存在时间超过其 timeLimit，则视为过期并移除
     * 这样可以避免 AI 接到已经超时的订单
     */
    removeExpiredOrders(currentTime) {
        const expiredOrders = [];
        for (const [orderId, order] of this.availableOrders.entries()) {
            // Check if order has been waiting too long (exceeded timeLimit since creation)
            const waitingTime = currentTime - order.createdAt;
            if (waitingTime > order.timeLimit) {
                expiredOrders.push(orderId);
            }
        }
        // Remove expired orders and log if any
        if (expiredOrders.length > 0) {
            console.log(`[OrderGenerator] Removing ${expiredOrders.length} expired order(s): ${expiredOrders.join(', ')}`);
        }
        expiredOrders.forEach(orderId => {
            this.availableOrders.delete(orderId);
            // V2 mode: release the order ID for reuse
            if (this.v2Mode && this.receiptDataManager) {
                this.receiptDataManager.markOrderExpired(orderId);
            }
        });
    }
    /**
     * Notify that an order has been completed (for V2 mode to release the ID)
     */
    notifyOrderCompleted(orderId) {
        if (this.v2Mode && this.receiptDataManager) {
            this.receiptDataManager.markOrderCompleted(orderId);
        }
    }
    /**
     * 搜索附近的订单
     */
    searchNearbyOrders(agentPosition, radius, distanceCalculator) {
        const nearbyOrders = [];
        for (const order of this.availableOrders.values()) {
            const distance = distanceCalculator(agentPosition, order.pickupLocation);
            if (distance <= radius) {
                nearbyOrders.push(order);
            }
        }
        return nearbyOrders;
    }
    /**
     * 清空订单池（用于测试）
     */
    clear() {
        this.availableOrders.clear();
        this.acceptedOrders.clear();
        this.orderCounter = 0;
    }
}
//# sourceMappingURL=order-generator.js.map