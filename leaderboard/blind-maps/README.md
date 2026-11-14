# leaderboard/blind-maps/

本目录只存放 `judge_pack.py` 生成的盲评私有映射：

```text
<规范模型ID>.<pack_id>.blind-map.json
```

用途与边界：

- 仅给运行汇总的人与 `finalize.py` 使用，**不得交给评委**；
- 一个盲评包对应一个映射，内容记录 `case_id -> runs/<run名>`，不得手工修改；
- `finalize.py` 默认从这里自动发现当前规范模型 ID 的映射；
- 归档批次的映射应及时删除或移到仓库外，否则可能与当前 run 冲突；
- 本目录默认被 `.gitignore` 排除，只保留本 README。
