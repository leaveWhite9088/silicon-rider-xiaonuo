/**
 * 配送费计算模块
 * 根据距离、商品价格和接单时段计算配送费用
 */
/**
 * 计算距离配送费
 * 需求：23.1, 23.2, 23.3
 *
 * @param distance 配送距离（km）
 * @returns 距离配送费（元）
 */
export declare function calculateDistanceFee(distance: number): number;
/**
 * 计算价格配送费
 * 需求：24.1, 24.2, 24.3, 24.4
 *
 * @param itemPrice 商品价格（元）
 * @returns 价格配送费（元）
 */
export declare function calculatePriceFee(itemPrice: number): number;
/**
 * 计算时段配送费
 * 需求：25.1, 25.2, 25.3, 25.4
 *
 * @param acceptTime 接单时间（游戏时间，分钟）
 * @returns 时段配送费（元）
 */
export declare function calculateTimeSlotFee(acceptTime: number): number;
/**
 * 计算总配送费
 * 需求：26.1, 26.2
 *
 * @param distance 配送距离（km）
 * @param itemPrice 商品价格（元）
 * @param acceptTime 接单时间（游戏时间，分钟）
 * @returns 总配送费（元）
 */
export declare function calculateTotalFee(distance: number, itemPrice: number, acceptTime: number): number;
//# sourceMappingURL=fee-calculator.d.ts.map