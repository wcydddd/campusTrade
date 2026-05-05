/**
 * CA2 Plan Table I — Workflow #1: Registration
 *
 * Validates: React form submit → API validates email → MongoDB stores user
 *            → JWT stored / verification flow
 * Success criteria:
 *   - User created with is_verified=false
 *   - Non-university emails rejected (前端拦截 / HTTP 400)
 */
describe('Registration workflow', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
  })

  function fillForm(email, username, pw1, pw2, agree = true) {
    cy.get('input[placeholder*="university email"]').type(email)
    cy.get('input[placeholder*="username"]').type(username)
    cy.get('input[placeholder*="At least 8"]').type(pw1)
    cy.get('input[placeholder*="Re-enter"]').type(pw2)
    if (agree) cy.get('input[type=checkbox]').check()
  }

  it('happy path: university email registers successfully', () => {
    const stamp = Date.now()
    const email = `cyptest${stamp}@university.edu`
    const username = `cyp${stamp}`

    cy.intercept('POST', '**/auth/register').as('register')
    cy.visit('/register')

    fillForm(email, username, 'Password123!', 'Password123!')
    cy.contains('button', /Create Account/i).click()

    cy.wait('@register').then((interception) => {
      expect(interception.response.statusCode).to.eq(201)
      expect(interception.response.body.email).to.eq(email)
      expect(interception.response.body.is_verified).to.eq(false)
    })

    // 注册后页面应展示成功信息
    cy.contains(/Registered/i, { timeout: 8000 }).should('be.visible')
  })

  it('rejects non-university email (client-side validation)', () => {
    cy.visit('/register')

    fillForm('hacker@gmail.com', 'baduser', 'Password123!', 'Password123!')
    cy.contains('button', /Create Account/i).click()

    // 前端 isUniversityEmail() 拦截，不发请求
    cy.contains(/university email/i, { timeout: 5000 }).should('be.visible')
  })

  it('rejects mismatched password confirmation (client-side)', () => {
    cy.visit('/register')

    fillForm('test@university.edu', 'testuser',
            'Password123!', 'DifferentPassword!')
    cy.contains('button', /Create Account/i).click()

    cy.contains(/do not match|Passwords do not/i, { timeout: 4000 })
      .should('be.visible')
  })

  it('rejects short password (<8 chars, client-side)', () => {
    cy.visit('/register')

    fillForm('test2@university.edu', 'testuser2', 'short1', 'short1')
    cy.contains('button', /Create Account/i).click()

    cy.contains(/at least 8/i, { timeout: 4000 }).should('be.visible')
  })

  it('rejects unchecked terms agreement', () => {
    cy.visit('/register')

    fillForm(`a${Date.now()}@university.edu`, 'testuser',
            'Password123!', 'Password123!', /* agree= */ false)
    cy.contains('button', /Create Account/i).click()

    cy.contains(/agree.*terms/i, { timeout: 4000 }).should('be.visible')
  })
})
