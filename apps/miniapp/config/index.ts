import { prodConfig } from './prod';
// 验收期间临时切到 dev（指向 localhost:4000 本地种子数据）；验收后切回 prodConfig，不提交此改动
// export const config = prodConfig;
import { devConfig } from './dev';
export const config = prodConfig;
