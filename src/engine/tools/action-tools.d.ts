/**
 * 行动类工具
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：6.1-6.5, 7.1-7.6, 8.1-8.4, 9.1-9.5, 10.1-10.5
 */
import { ToolDefinition } from './tool-registry';
/**
 * 接受订单
 * 需求：6.1-6.5
 */
export declare const acceptOrderTool: ToolDefinition;
/**
 * 移动到指定位置
 * 需求：7.1-7.6
 */
export declare const moveToTool: ToolDefinition;
/**
 * 取餐
 * 需求：8.1-8.4
 */
export declare const pickupFoodTool: ToolDefinition;
/**
 * 送餐
 * 需求：9.1-9.5
 */
export declare const deliverFoodTool: ToolDefinition;
/**
 * 换电
 * 需求：10.1-10.5
 */
export declare const swapBatteryTool: ToolDefinition;
/**
 * Get receipts at a location (V2 mode only)
 * Returns receipt images for all orders that need to be picked up at the specified location
 * In Level 2 and Level 3 modes, also includes 1-3 interference receipts to test AI's ability to identify the correct receipt
 */
export declare const getReceiptsTool: ToolDefinition;
/**
 * Pickup food by phone number (V2 mode only)
 * AI must identify the phone number from the receipt image and provide it to pick up the order
 */
export declare const pickupFoodByPhoneTool: ToolDefinition;
/**
 * 等待（跳过时间）
 * 用于等待新订单生成或时间推进
 */
export declare const waitTool: ToolDefinition;
/**
 * 获取所有行动工具 (V1 mode)
 */
export declare function getActionTools(): ToolDefinition[];
/**
 * 获取 V2 模式的行动工具
 * 不包含 pickup_food，增加 get_receipts 和 pickup_food_by_phone_number
 */
export declare function getActionToolsV2(): ToolDefinition[];
/**
 * V3 版本：接受订单
 */
export declare const acceptOrderToolV3: ToolDefinition;
/**
 * V3 版本：移动到目标位置
 */
export declare const moveToToolV3: ToolDefinition;
/**
 * V3 版本：获取小票
 */
export declare const getReceiptsToolV3: ToolDefinition;
/**
 * V3 版本：通过手机号取餐
 */
export declare const pickupFoodByPhoneToolV3: ToolDefinition;
/**
 * V3 版本：送餐
 */
export declare const deliverFoodToolV3: ToolDefinition;
/**
 * V3 版本：换电
 */
export declare const swapBatteryToolV3: ToolDefinition;
/**
 * V3 版本：等待
 */
export declare const waitToolV3: ToolDefinition;
/**
 * 获取 V3 模式的行动工具（多骑手模式）
 * 基于 V2 的多模态取餐流程，所有工具都需要 agent_id 参数
 */
export declare function getActionToolsV3(): ToolDefinition[];
//# sourceMappingURL=action-tools.d.ts.map