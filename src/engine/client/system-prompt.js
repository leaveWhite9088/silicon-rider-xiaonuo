/**
 * help 工具依赖的系统提示生成器。
 *
 * 说明：query-tools.js 的 help 工具会动态 import('../client/system-prompt.js')，
 * 但本目录的引擎产物里没有这个文件，导致 help 调用必然失败（并被计为无效调用）。
 * 这里按上游语义补一个等价实现：返回规则、工具清单与当前状态。
 */
export function generateSystemPrompt(simulator) {
    const a = simulator?.getAgentState?.();
    const now = simulator?.getCurrentTime?.();
    const hh = typeof now === 'number' ? `${String(Math.floor(now / 60) % 24).padStart(2, '0')}:${String(Math.floor(now % 60)).padStart(2, '0')}` : '?';
    const pos = a?.getPosition?.() ?? '?';
    const bat = a?.getBattery?.() ?? '?';
    const profit = a?.getProfit?.() ?? 0;

    return [
        '# 模拟城市 · 外卖骑手',
        '',
        `当前：${hh}（班次 06:00–14:00）　位置 ${pos}　电量 ${bat}%　已赚 ¥${Number(profit).toFixed(2)}`,
        '',
        '## 规则要点',
        '- 移动耗时 = 距离 / 速度：畅通 30 km/h（≈2 分钟/km），拥堵时降为 25/20/15；7:00–9:00 地图边缘道路更堵。',
        '- 电量每公里消耗 2%，满电 50 km；电量耗尽后按推行速度 10 km/h 计。',
        '- 取货固定 2 分钟、送货固定 1 分钟；换电 1 分钟 + 0.5 元，电量恢复到 100%。',
        '- 承载上限：5 单 / 10 kg。',
        '- 时限 = 接单时刻 + 该单 timeLimit（`20 + 3×(取送距离−3)`，不足 3 km 记 20 分钟）。',
        '  观察里 `carried[].deadline` 就是真实截止时刻；`openOrders[].timeLimit` 是接单后才会开始的时长。',
        '- 超时罚款：≤5 分钟不扣；5–10 分钟扣 30%；10–15 分钟扣 50%；>15 分钟扣 70%。',
        '- 配送费 = 起步 3.65 元（≤3 km）+ 距离费（3–4 km 每 0.1 km +0.15；>4 km 每 0.1 km +0.1）'
            + ' + 商品价格费（客单价越高越肥）+ 时段费（06:00–07:00 接单 +1 元）。',
        '- 时钟到 840（14:00）后不再执行任何动作；总轮数上限 400。',
        '- 新单按**模拟时间**到达（每 5 分钟一批）；查询类工具不推进时间，因此查不出新单。',
        '',
        '## 工具（13 个）',
        '查询（不耗时）：get_my_status、search_nearby_battery_stations(radius)、',
        '  get_location_info(locationId)、calculate_distance(fromId,toId)、estimate_time(locationIds[])、get_map、help',
        '动作（耗时）：accept_order(orderId)、move_to(targetLocationId)、pickup_food(orderId)、',
        '  deliver_food(orderId)、swap_battery()、wait(minutes 1–60)',
        '（全部在库单已在每轮观察里给出，因此没有“搜单”工具。）',
        '',
        '## 策略提示',
        '- 挑单看“单位时间收入”：fee ÷ (2×(接驾km + 送餐km) + 3分)，而不是只看配送费。',
        '- 接单才起算时限：可以先骑到取餐点附近再接单，把空驶挪到时限之外（但要留余地，订单可能过期）。',
        '- 合单看最紧的那一单：从接单到第一单送达必须小于该单时限，取餐点扎堆、送餐点同向才值得合。',
        '- 电量按“下一趟之前够不够”规划，别等掉到 0；剩余续航 < 本趟里程 + 5 km 就先换电。',
        '- 班末 20 分钟只接能送完的单；最后一趟必须 13:58 前送完。',
    ].join('\n');
}
