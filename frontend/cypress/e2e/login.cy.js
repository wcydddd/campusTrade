/**
 * CA2 Plan Aim 1.2 — Login workflow
 *
 * Counterpart to registration.cy.js:
 *   - Verifies POST /auth/login UI flow
 *   - Validates JWT is stored in localStorage
 *   - Validates redirect-after-login behavior
 *   - Confirms client-side error handling for bad credentials
 */
describe('Login workflow', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
  })

  it('happy path: correct credentials log in and redirect home', () => {
    cy.intercept('POST', '**/auth/login').as('login')
    cy.visit('/login')

    cy.get('input[placeholder*="university email"]').type(Cypress.env('testEmail'))
    cy.get('input[placeholder*="••"]').type(Cypress.env('testPassword'))
    cy.contains('button', /Sign in/i).click()

    cy.wait('@login').then((interception) => {
      expect(interception.response.statusCode).to.eq(200)
      expect(interception.response.body.access_token).to.be.a('string')
      expect(interception.response.body.user.email)
        .to.eq(Cypress.env('testEmail'))
    })

    // 登录成功后 token 应进 storage（默认 sessionStorage，rememberMe=true 时进 localStorage）
    cy.window().then((win) => {
      const token = win.sessionStorage.getItem('token')
                 || win.localStorage.getItem('token')
      expect(token, 'token in storage').to.match(/^eyJ/)
    })

    // 应跳转到首页（或某个已登录页面）
    cy.url({ timeout: 6000 }).should('not.include', '/login')
  })

  it('rejects wrong password (HTTP 401)', () => {
    cy.intercept('POST', '**/auth/login').as('login')
    cy.visit('/login')

    cy.get('input[placeholder*="university email"]').type(Cypress.env('testEmail'))
    cy.get('input[placeholder*="••"]').type('WrongPassword999!')
    cy.contains('button', /Sign in/i).click()

    cy.wait('@login').then((interception) => {
      expect(interception.response.statusCode).to.eq(401)
    })

    // 错误信息应显示
    cy.contains(/Invalid|Incorrect|wrong|password/i, { timeout: 5000 })
      .should('be.visible')

    // 任何 storage 都不应有 token
    cy.window().then((win) => {
      expect(win.localStorage.getItem('token')).to.be.null
      expect(win.sessionStorage.getItem('token')).to.be.null
    })
  })

  it('rejects unknown email (HTTP 401)', () => {
    cy.intercept('POST', '**/auth/login').as('login')
    cy.visit('/login')

    cy.get('input[placeholder*="university email"]')
      .type('definitelydoesnotexist@university.edu')
    cy.get('input[placeholder*="••"]').type('Password123!')
    cy.contains('button', /Sign in/i).click()

    cy.wait('@login').then((interception) => {
      expect(interception.response.statusCode).to.eq(401)
    })

    cy.contains(/Invalid|Incorrect/i, { timeout: 5000 }).should('be.visible')
  })

  it('preserves token across page reloads (session persistence)', () => {
    cy.loginAsTestUser()
    cy.visit('/')
    cy.window().then((win) => {
      expect(win.localStorage.getItem('token')).to.match(/^eyJ/)
    })

    // reload — token 应仍在
    cy.reload()
    cy.window().then((win) => {
      expect(win.localStorage.getItem('token')).to.match(/^eyJ/)
    })
  })
})
