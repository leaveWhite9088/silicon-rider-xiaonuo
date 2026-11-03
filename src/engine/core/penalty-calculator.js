/**
 * 超时惩罚计算模块
 * 根据超时时长计算惩罚比例和最终支付金额
 */
/**
 * 计算超时惩罚和最终支付金额
 * 需求：9.2, 9.3, 22.1-22.5
 *
 * 惩罚规则：
 * - 0-5分钟（含）：不扣款（0%）
 * - 5分钟（不含）-10分钟（含）：扣除 30%
 * - 10分钟（不含）-15分钟（含）：扣除 50%
 * - 15分钟以上：扣除 70%
 *
 * @param deliveryFee 订单配送费（元）
 * @param deadline 订单截止时间（游戏时间，分钟）
 * @param deliveryTime 实际送达时间（游戏时间，分钟）
 * @returns 支付结果（包含实际支付金额、惩罚金额和超时分钟数）
 */
export function calculatePayment(deliveryFee, deadline, deliveryTime) {
    // 计算超时时长（分钟）
    const overtime = Math.max(0, deliveryTime - deadline);
    // 根据超时时长确定惩罚比例
    let penaltyRate = 0;
    if (overtime <= 5) {
        // 0-5分钟（含）：不扣款
        penaltyRate = 0;
    }
    else if (overtime <= 10) {
        // 5分钟（不含）-10分钟（含）：扣除 30%
        penaltyRate = 0.3;
    }
    else if (overtime <= 15) {
        // 10分钟（不含）-15分钟（含）：扣除 50%
        penaltyRate = 0.5;
    }
    else {
        // 15分钟以上：扣除 70%
        penaltyRate = 0.7;
    }
    // 计算惩罚金额
    const penalty = deliveryFee * penaltyRate;
    // 计算最终支付金额
    const payment = deliveryFee - penalty;
    return {
        payment,
        penalty,
        overtime
    };
}
//# sourceMappingURL=penalty-calculator.js.map