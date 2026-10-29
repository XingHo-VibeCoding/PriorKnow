/// <reference types="vite/client" />

// 为什么需要这个文件（Day 24 收尾时补的）：
//
// 项目里第一次用到 `import.meta.env`（见 App.tsx 的 `import.meta.env.DEV`）时，
// tsc 报 `Property 'env' does not exist on type 'ImportMeta'` ——
// 因为 `env` 不是 TypeScript 自带的，是 Vite 注入的类型，
// 要靠 `vite/client` 这份声明补进来。
//
// 标准 Vite 模板本来就带这个文件，本项目当初是手写的 tsconfig，所以漏了。
// 它只声明类型，不产生任何运行时代码。
