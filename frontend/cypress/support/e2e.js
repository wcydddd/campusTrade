// Cypress E2E 全局支持文件
import './commands'

// 忽略某些非致命错误（React 19 + RR v7 偶尔会在测试环境抛非阻塞警告）
Cypress.on('uncaught:exception', (err) => {
  // 忽略 ResizeObserver 循环（浏览器已知限制）
  if (err.message.includes('ResizeObserver loop')) return false
  // 其他错误正常上报
  return true
})
