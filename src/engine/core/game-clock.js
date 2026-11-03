/**
 * 游戏时钟系统
 * 管理游戏内部时间，支持时间初始化、推进和查询
 *
 * 需求：3.1, 3.2, 3.3, 3.4
 */
/**
 * 游戏时钟类
 *
 * 功能：
 * - 从配置的开始时间启动（默认 0:00）
 * - 随着智能体执行操作推进时间
 * - 检测是否达到结束时间
 * - 提供当前游戏时间查询
 */
export class GameClock {
    currentTime; // 当前游戏时间（分钟）
    startTime; // 开始时间（分钟）
    endTime; // 结束时间（分钟）
    /**
     * 创建游戏时钟
     *
     * @param startTime - 开始时间（分钟，默认 360，即 6:00）
     * @param endTime - 结束时间（分钟，默认 1800，即第二天 6:00）
     *
     * 需求 3.1: WHEN 模拟器初始化 THEN 游戏时钟 SHALL 从配置的开始时间启动（默认 6:00）
     */
    constructor(startTime = 360, endTime = 1800) {
        if (startTime < 0) {
            throw new Error('Start time must be non-negative');
        }
        if (endTime <= startTime) {
            throw new Error('End time must be greater than start time');
        }
        this.startTime = startTime;
        this.endTime = endTime;
        this.currentTime = startTime;
    }
    /**
     * 推进游戏时间
     *
     * @param minutes - 要推进的分钟数
     * @returns 推进后的当前时间
     *
     * 需求 3.2: WHEN 智能体执行操作 THEN 游戏时钟 SHALL 推进该操作的时间成本
     */
    advance(minutes) {
        if (minutes < 0) {
            throw new Error('Cannot advance time by negative amount');
        }
        this.currentTime += minutes;
        return this.currentTime;
    }
    /**
     * 获取当前游戏时间
     *
     * @returns 当前游戏时间（分钟）
     *
     * 需求 3.4: WHEN 查询时 THEN 模拟器 SHALL 向智能体提供当前游戏时间
     */
    getCurrentTime() {
        return this.currentTime;
    }
    /**
     * 检查是否达到结束时间
     *
     * @returns 如果达到或超过结束时间返回 true
     *
     * 需求 3.3: WHEN 游戏时钟达到配置的结束时间 THEN 模拟器 SHALL 终止模拟
     */
    hasReachedEnd() {
        return this.currentTime >= this.endTime;
    }
    /**
     * 获取开始时间
     */
    getStartTime() {
        return this.startTime;
    }
    /**
     * 获取结束时间
     */
    getEndTime() {
        return this.endTime;
    }
    /**
     * 获取剩余时间
     *
     * @returns 剩余时间（分钟）
     */
    getRemainingTime() {
        return Math.max(0, this.endTime - this.currentTime);
    }
    /**
     * 获取已经过时间
     *
     * @returns 已经过时间（分钟）
     */
    getElapsedTime() {
        return this.currentTime - this.startTime;
    }
    /**
     * 将分钟转换为时:分格式
     *
     * @param minutes - 分钟数
     * @returns 格式化的时间字符串（HH:MM）
     */
    static formatTime(minutes) {
        const hours = Math.floor(minutes / 60) % 24; // 使用模运算确保小时在 0-23 范围内
        const mins = Math.floor(minutes % 60);
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    /**
     * 获取格式化的当前时间
     *
     * @returns 格式化的时间字符串（HH:MM）
     */
    getFormattedTime() {
        return GameClock.formatTime(this.currentTime);
    }
    /**
     * 重置时钟到开始时间
     */
    reset() {
        this.currentTime = this.startTime;
    }
}
//# sourceMappingURL=game-clock.js.map