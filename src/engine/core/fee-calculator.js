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
export function calculateDistanceFee(distance) {
    if (distance <= 3) {
        // 0-3km（含）：起步价 3.65 元
        return 3.65;
    }
    else if (distance <= 4) {
        // 3km（不含）-4km（含）：起步价 + 每 0.1km 加收 0.15 元
        return 3.65 + (distance - 3) * 10 * 0.15;
    }
    else {
        // 4km 以上：4km 费用 + 每 0.1km 加收 0.1 元
        return 3.65 + 10 * 0.15 + (distance - 4) * 10 * 0.1;
    }
}
/**
 * 计算价格配送费
 * 需求：24.1, 24.2, 24.3, 24.4
 *
 * @param itemPrice 商品价格（元）
 * @returns 价格配送费（元）
 */
export function calculatePriceFee(itemPrice) {
    if (itemPrice <= 25) {
        // 0-25元（含）：0 元
        return 0;
    }
    else if (itemPrice <= 30) {
        // 25元（不含）-30元（含）：25元以上部分每上涨 1 元加收 0.19 元
        return (itemPrice - 25) * 0.19;
    }
    else if (itemPrice <= 50) {
        // 30元（不含）-50元（含）：30元以上部分每上涨 1 元加收 0.18 元
        return 5 * 0.19 + (itemPrice - 30) * 0.18;
    }
    else {
        // 50元以上：50元以上部分每上涨 1 元加收 0.17 元
        return 5 * 0.19 + 20 * 0.18 + (itemPrice - 50) * 0.17;
    }
}
/**
 * 计算时段配送费
 * 需求：25.1, 25.2, 25.3, 25.4
 *
 * @param acceptTime 接单时间（游戏时间，分钟）
 * @returns 时段配送费（元）
 */
export function calculateTimeSlotFee(acceptTime) {
    const hour = Math.floor(acceptTime / 60);
    // 00:00（不含）到 02:00（含）：加收 0.5 元
    if (hour > 0 && hour <= 2) {
        return 0.5;
    }
    // 02:00（不含）到 06:00（含）：加收 1 元
    if (hour > 2 && hour <= 6) {
        return 1.0;
    }
    // 22:00（不含）到 24:00（含）：加收 0.3 元
    if (hour > 22 && hour <= 24) {
        return 0.3;
    }
    // 其他时段：不加收
    return 0;
}
/**
 * 计算总配送费
 * 需求：26.1, 26.2
 *
 * @param distance 配送距离（km）
 * @param itemPrice 商品价格（元）
 * @param acceptTime 接单时间（游戏时间，分钟）
 * @returns 总配送费（元）
 */
export function calculateTotalFee(distance, itemPrice, acceptTime) {
    const distanceFee = calculateDistanceFee(distance);
    const priceFee = calculatePriceFee(itemPrice);
    const timeSlotFee = calculateTimeSlotFee(acceptTime);
    return distanceFee + priceFee + timeSlotFee;
}
//# sourceMappingURL=fee-calculator.js.map