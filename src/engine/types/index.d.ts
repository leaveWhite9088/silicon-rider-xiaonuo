/**
 * 核心数据类型定义
 * Silicon Rider Bench - Agent 基准测试系统
 */
/**
 * 节点类型
 */
export type NodeType = 'restaurant' | 'supermarket' | 'pharmacy' | 'residential' | 'office' | 'battery_swap';
/**
 * 节点（地图上的位置）
 */
export interface Node {
    id: string;
    type: NodeType;
    position: {
        x: number;
        y: number;
    };
    name: string;
    emoji?: string;
}
/**
 * 边（连接两个节点的道路）
 */
export interface Edge {
    from: string;
    to: string;
    distance: number;
    baseCongestion: number;
}
/**
 * 拥堵程度
 */
export type CongestionLevel = 'normal' | 'light' | 'moderate' | 'heavy';
/**
 * 订单类型
 */
export type OrderType = 'food' | 'supermarket' | 'pharmacy';
/**
 * 订单
 */
export interface Order {
    id: string;
    type: OrderType;
    name: string;
    pickupLocation: string;
    deliveryLocation: string;
    distance: number;
    itemPrice: number;
    deliveryFee: number;
    weight: number;
    timeLimit: number;
    createdAt: number;
    acceptedAt?: number;
    deadline?: number;
    pickedUp: boolean;
    delivered: boolean;
    phoneNumber?: string;
    receiptImagePath?: string;
    foodItems?: Array<{
        name: string;
        price: number;
    }>;
}
/**
 * 智能体状态
 */
export interface AgentState {
    position: string;
    battery: number;
    carriedOrders: Order[];
    totalWeight: number;
    profit: number;
    completedOrders: number;
    totalDistance: number;
}
/**
 * 世界状态
 */
export interface WorldState {
    nodes: Map<string, Node>;
    edges: Edge[];
    currentTime: number;
    seed: number;
    congestionMap: Map<string, number>;
}
/**
 * 工具调用请求
 */
export interface ToolCallRequest {
    toolName: string;
    parameters: Record<string, any>;
}
/**
 * 工具调用成功响应
 */
export interface ToolCallSuccess<T = any> {
    success: true;
    data: T;
}
/**
 * 工具调用错误响应
 */
export interface ToolCallError {
    success: false;
    error: {
        code: ErrorCode;
        message: string;
        details?: any;
    };
}
/**
 * 工具调用响应（成功或失败）
 */
export type ToolCallResponse<T = any> = ToolCallSuccess<T> | ToolCallError;
/**
 * 错误代码
 */
export type ErrorCode = 'INVALID_PARAMETER' | 'INVALID_LOCATION' | 'INVALID_ORDER' | 'CAPACITY_EXCEEDED' | 'WEIGHT_EXCEEDED' | 'WRONG_LOCATION' | 'ORDER_NOT_CARRIED' | 'ORDER_NOT_PICKED_UP' | 'BATTERY_DEPLETED' | 'NOT_AT_SWAP_STATION' | 'PHONE_NUMBER_NOT_MATCH' | 'NO_RECEIPTS_AT_LOCATION';
/**
 * get_my_status 响应
 */
export interface GetMyStatusResponse {
    position: string;
    battery: number;
    batteryRange: number;
    acceptedOrders: Array<{
        id: string;
        type: string;
        name: string;
        weight: number;
        deadline: number;
        pickupLocation: string;
        deliveryLocation: string;
    }>;
    carriedOrders: Array<{
        id: string;
        type: string;
        name: string;
        weight: number;
        deadline: number;
        pickupLocation: string;
        deliveryLocation: string;
    }>;
    totalWeight: number;
    remainingCapacity: number;
    currentTime: number;
    formattedTime: string;
    remainingTime: number;
    formattedRemainingTime: string;
    profit: number;
}
/**
 * search_nearby_orders 响应
 */
export interface SearchNearbyOrdersResponse {
    orders: Array<{
        id: string;
        type: OrderType;
        name: string;
        deliveryFee: number;
        weight: number;
        itemPrice: number;
        pickupLocation: string;
        deliveryLocation: string;
        distance: number;
        estimatedTimeLimit: number;
    }>;
}
/**
 * search_nearby_battery_stations 响应
 */
export interface SearchNearbyBatteryStationsResponse {
    stations: Array<{
        id: string;
        name: string;
        distance: number;
        estimatedTime: number;
        position: {
            x: number;
            y: number;
        };
    }>;
}
/**
 * get_location_info 响应
 */
export interface GetLocationInfoResponse {
    id: string;
    type: string;
    name: string;
    position: {
        x: number;
        y: number;
    };
    /** 相邻的位置列表 */
    neighbors: Array<{
        id: string;
        name: string;
        type: string;
        distance: string;
    }>;
}
/**
 * calculate_distance 响应
 */
export interface CalculateDistanceResponse {
    distance: number;
    path: string[];
}
/**
 * estimate_time 响应
 */
export interface EstimateTimeResponse {
    totalTime: number;
    segments: Array<{
        from: string;
        to: string;
        distance: number;
        congestion: string;
        speed: number;
        time: number;
        path: string[];
    }>;
}
/**
 * get_map 响应
 * 返回完整地图信息，按类型分组 + 邻接表格式
 */
export interface GetMapResponse {
    /** 按类型分组的位置列表 */
    locationsByType: {
        restaurant: string[];
        supermarket: string[];
        pharmacy: string[];
        residential: string[];
        office: string[];
        battery_swap: string[];
    };
    /** 邻接表：每个位置可以直接到达的相邻位置 */
    connections: Record<string, Array<{
        to: string;
        name: string;
        type: string;
        distance: string;
    }>>;
}
/**
 * accept_order 响应
 */
export interface AcceptOrderResponse {
    success: boolean;
    message?: string;
    order?: Order;
}
/**
 * move_to 响应
 */
export interface MoveToResponse {
    success: boolean;
    timeCost: number;
    batteryCost: number;
    newPosition: string;
    distance?: number;
    pushedDistance?: number;
}
/**
 * pickup_food 响应
 */
export interface PickupFoodResponse {
    success: boolean;
    timeCost: number;
    message?: string;
}
/**
 * deliver_food 响应
 */
export interface DeliverFoodResponse {
    success: boolean;
    payment: number;
    overtime: number;
    penalty: number;
    timeCost: number;
}
/**
 * swap_battery 响应
 */
export interface SwapBatteryResponse {
    success: boolean;
    cost: number;
    timeCost: number;
    newBattery: number;
}
/**
 * get_receipts 响应（V2 模式）
 */
export interface GetReceiptsResponse {
    receipts: Array<{
        orderId: string;
        imagePath: string;
        imageData?: string;
        isInterference?: boolean;
    }>;
    message?: string;
}
/**
 * pickup_food_by_phone_number 响应（V2 模式）
 */
export interface PickupFoodByPhoneResponse {
    success: boolean;
    timeCost: number;
    orderId?: string;
    message?: string;
}
/**
 * wait 响应
 */
export interface WaitResponse {
    success: boolean;
    timeCost: number;
    previousTime: number;
    currentTime: number;
    newOrdersGenerated: number;
    expiredOrders: number;
    message?: string;
}
/**
 * 移动结果
 */
export interface MoveResult {
    time: number;
    batteryCost: number;
    pushedDistance: number;
}
/**
 * 支付结果
 */
export interface Payment {
    payment: number;
    penalty: number;
    overtime: number;
}
/**
 * Level 配置
 */
export interface LevelConfig {
    duration: number;
    mapSize: 'small' | 'large';
    seed: number;
    orderCount?: number;
    baseOrderFrequency?: number;
    useRealReceiptData?: boolean;
    excludeNodeTypes?: NodeType[];
    simulationRiderNum?: number;
}
/**
 * 小票中的食品项
 */
export interface ReceiptFoodItem {
    name: string;
    price: number;
}
/**
 * 单条小票数据
 */
export interface ReceiptData {
    order_id: string;
    image_filename: string;
    phone_number: string;
    food_items: ReceiptFoodItem[];
    total_price: number;
}
/**
 * 小票数据集
 */
export interface ReceiptDataset {
    metadata: {
        version: string;
        created_at: string;
        total_orders: number;
        source: string;
    };
    orders: ReceiptData[];
}
/**
 * 图片传输模式
 */
export type ImageTransportMode = 'base64' | 'file_path';
/**
 * 单个代理配置
 */
export interface AgentConfig {
    id: string;
    modelName: string;
    baseURL?: string;
    apiKey?: string;
}
/**
 * 多代理运行时状态
 */
export interface AgentRuntimeState {
    id: string;
    modelName: string;
    position: string;
    battery: number;
    profit: number;
    carriedOrders: Order[];
    status: 'idle' | 'thinking' | 'executing' | 'error';
    lastAction?: string;
    lastActionTime?: number;
}
//# sourceMappingURL=index.d.ts.map