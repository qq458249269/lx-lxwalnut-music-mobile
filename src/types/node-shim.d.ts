// 极简 Node 环境 shim：RN/Hermes 运行时自带 process/Buffer，类型层面无需 @types/node。
// 注意：不引入 @types/node 是因为其全局 setInterval/setTimeout 返回 NodeJS.Timeout，
// 与 RN 的 number 语义冲突（React Native 类型自身提供正确的全局定时器签名）。

declare const process: {
  versions: { app: string; [key: string]: string | undefined }
  env: Record<string, string | undefined>
}

declare const performance: {
  now(): number
}

declare module 'buffer' {
  export class Buffer {
    length: number
    static from(data: string, encoding?: string): Buffer
    toString(encoding?: string): string
  }
}