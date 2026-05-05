// 自定义命令：缩短 spec 代码

/**
 * 生成一个随机伪 IP，让后端看到不同的 X-Forwarded-For，
 * 避免连续多次 login 触发 rate_limiter 的"同 IP 60s 内 10 次"限流。
 */
function fakeIp() {
  return `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
}

/**
 * 用 API 直接登录拿 token（绕过 UI 交互，加快测试）
 * 使用：cy.apiLogin(email, password)
 */
Cypress.Commands.add('apiLogin', (email, password) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('apiBase')}/auth/login`,
    body: { email, password },
    headers: { 'X-Forwarded-For': fakeIp() },
  }).then((res) => {
    expect(res.status).to.eq(200)
    window.localStorage.setItem('token', res.body.access_token)
    window.localStorage.setItem('user', JSON.stringify(res.body.user))
    return res.body
  })
})

/**
 * 默认账号一键登录
 * 使用：cy.loginAsTestUser()
 */
Cypress.Commands.add('loginAsTestUser', () => {
  return cy.apiLogin(Cypress.env('testEmail'), Cypress.env('testPassword'))
})

/**
 * 注销：清掉 localStorage 里的 token
 */
Cypress.Commands.add('logout', () => {
  cy.window().then((win) => {
    win.localStorage.removeItem('token')
    win.localStorage.removeItem('user')
  })
})
