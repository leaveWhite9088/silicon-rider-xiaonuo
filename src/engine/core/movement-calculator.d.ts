/**
 * 移动计算模块
 * 计算移动时间、电量消耗和电池续航
 *
 * 需求：7.1-7.6, 10.5
 */
/**
 * 移动结果
 */
export interface MovementResult {
    time: number;
    batteryCost: number;
    pushedDistance: number;
}
/**
 * 移动计算器类
 */
export declare class MovementCalculator {
    /**
     * 满电续航距离（km）
     */
    private static readonly FULL_BATTERY_RANGE;
    /**
     * 推行速度（km/h）
     */
    private static readonly PUSHING_SPEED;
    /**
     * 计算骑行速度
     *
     * @param congestion - 拥堵程度（0-1）
     * @param battery - 当前电量（0-100%）
     * @returns 速度（km/h）
     *
     * 需求 7.2: WHEN 智能体移动且电量充足 THEN 模拟器 SHALL 根据边的距离和当前拥堵程度对应的骑行速度计算通行时间
     * 需求 7.5: WHEN 智能体电量为零时移动 THEN 模拟器 SHALL 使用推行速度 10km/h 计算通行时间
     */
    static calculateSpeed(congestion: number, battery: number): number;
    /**
     * 计算电池续航（剩余可行驶距离）
     *
     * @param battery - 当前电量（0-100%）
     * @returns 剩余续航（km）
     *
     * 需求 10.5: WHEN 智能体查询电池续航 THEN 模拟器 SHALL 返回当前电量可行驶的剩余公里数，满电续航 50km
     */
    static calculateBatteryRange(battery: number): number;
    /**
     * 计算移动的电量消耗
     *
     * @param distance - 移动距离（km）
     * @returns 电量消耗（%）
     *
     * 需求 7.3: WHEN 智能体移动且电量充足 THEN 模拟器 SHALL 按行驶距离成比例降低电量，每公里消耗 2% 电量
     */
    static calculateBatteryCost(distance: number): number;
    /**
     * 计算移动时间和电量消耗
     *
     * @param distance - 移动距离（km）
     * @param congestion - 拥堵程度（0-1）
     * @param currentBattery - 当前电量（0-100%）
     * @returns 移动结果
     *
     * 需求 7.2: WHEN 智能体移动且电量充足 THEN 模拟器 SHALL 根据边的距离和当前拥堵程度对应的骑行速度计算通行时间
     * 需求 7.3: WHEN 智能体移动且电量充足 THEN 模拟器 SHALL 按行驶距离成比例降低电量，每公里消耗 2% 电量
     * 需求 7.4: IF 智能体移动过程中电量降至零 THEN 模拟器 SHALL 计算电量耗尽位置，将剩余路程按推行速度 10km/h 计算
     * 需求 7.5: WHEN 智能体电量为零时移动 THEN 模拟器 SHALL 使用推行速度 10km/h 计算通行时间
     */
    static calculateMovement(distance: number, congestion: number, currentBattery: number): MovementResult;
}
//# sourceMappingURL=movement-calculator.d.ts.map