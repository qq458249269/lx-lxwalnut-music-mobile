// 屏蔽 @types/node 注入全局类型：仅满足第三方 d.ts 中的
// `/// <reference types="node" />`（如 @buttercup/fetch 的 node-fetch 类型）。
// RN 环境全局 setInterval/setTimeout 返回 number，由 @types/react-native 提供；
// 引入 @types/node 会使它们返回 NodeJS.Timeout，与 RN 语义冲突。
// process / Buffer 由 node-shim.d.ts 提供极简声明。
export {}