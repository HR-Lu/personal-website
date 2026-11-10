// esbuild 打包入口：把 ziwei 项目的排盘引擎 + 农历库打成单文件浏览器 IIFE
// 依赖 /Users/lhr/EnMo/ziwei 的 node_modules（iztro / lunar-javascript）
// 构建命令见 tools/build-engine.sh
export { generateChart } from '../../ziwei/lib/ziwei/algorithm.ts';
export { Solar, Lunar } from '../../ziwei/node_modules/lunar-javascript/index.js';
