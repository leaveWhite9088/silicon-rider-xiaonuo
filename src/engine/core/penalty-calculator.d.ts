/**
 * 超时惩罚计算模块
 * 根据超时时长计算惩罚比例和最终支付金额
 */
import { Payment } from '../types';
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
export declare function calculatePayment(deliveryFee: number, deadline: number, deliveryTime: number): Payment;
//# sourceMappingURL=penalty-calculator.d.ts.map