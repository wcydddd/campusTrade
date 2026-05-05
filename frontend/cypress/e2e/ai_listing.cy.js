/**
 * CA2 Plan Table I — Workflow #2: AI Listing
 *
 * Validates: Verified user uploads photo → OpenAI → API returns title/description/
 *            category → form auto-populated → product saved.
 * Success criteria:
 *   - Response within 8s (asserted on the API call itself, not the UI flow)
 *   - Product saved (POST /products → 200/201)
 *   - Unverified user → redirected away from /publish
 *
 * ⚠️ This spec triggers REAL OpenAI calls and costs ~$0.02 per run.
 *    OPENAI_API_KEY must be set in backend .env.
 */

describe('AI Listing workflow', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
  })

  it('unauthenticated user is redirected away from /publish', () => {
    cy.visit('/publish')
    cy.url({ timeout: 6000 }).should('match', /login|home|\/$/)
  })

  it('verified user uploads image → AI fills form → publish succeeds', () => {
    cy.intercept('POST', '**/ai/analyze-and-save').as('aiSave')
    // POST /products 或 POST /products/with-image（** 同时匹配两者）
    cy.intercept('POST', '**/products**').as('createProduct')

    cy.loginAsTestUser().then(() => {
      cy.visit('/publish')

      // 上传图片到 AI 卡片的隐藏 input
      cy.get('input[type=file]').first()
        .selectFile('cypress/fixtures/test_product.png', { force: true })

      // 点击 AI Smart Publish
      cy.contains('button', /AI Smart Publish/i).should('be.visible').click()

      // 等真实 OpenAI 响应（最多 30s 留出网络余量；耗时<8s 单独断言）
      cy.wait('@aiSave', { timeout: 30000 }).then((interception) => {
        expect(interception.response.statusCode).to.eq(200)
        const body = interception.response.body || {}
        const data = body.data || {}
        expect(data).to.include.keys('title', 'description', 'category')

        // CA2 性能目标：AI 响应 < 8s
        const elapsed =
          (interception.response.headers?.['x-response-time-ms'] &&
            Number(interception.response.headers['x-response-time-ms'])) ||
          (interception.response?.duration ?? 0)
        if (elapsed) {
          expect(elapsed, 'AI response time (ms)').to.be.lessThan(8000)
        }
      })

      // 后端可能因低置信度弹出 "Confirm AI Result" 模态；若有就点 Apply to Form
      cy.get('body').then(($body) => {
        if ($body.find(':contains("Confirm AI Result")').length) {
          cy.contains('button', /Apply to Form/i).click()
        }
      })

      // 表单 title 应被 AI 数据填充
      cy.get('input[placeholder="Product title"]', { timeout: 8000 })
        .should('not.have.value', '')

      // 价格手填（AI 不返回价格）
      cy.get('input[placeholder="0.00"]').clear().type('29.99')

      // 提交
      cy.contains('button', /Confirm.*Publish/i).click()

      cy.wait('@createProduct', { timeout: 15000 }).then((interception) => {
        expect([200, 201]).to.include(interception.response.statusCode)
      })
    })
  })
})
