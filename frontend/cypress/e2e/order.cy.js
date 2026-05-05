/**
 * Order workflow — 完整交易闭环（CA2 业务核心）
 *
 * Buyer 浏览商品 → 点 "Buy Now" → pending 订单 → seller confirm → 双方 complete
 *
 * 优化：登录 token 在 before() 里只取一次并缓存，避免触发 user_key 维度限流
 *      （rate_limiter 限同邮箱 60s 内最多 10 次登录）
 */
const apiBase = Cypress.env('apiBase')

describe('Order workflow', () => {
  let partnerToken
  let partnerUser
  let buyerToken
  let buyerUser

  function rndIp() {
    return `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
  }

  before(() => {
    // 整个 spec 只做 2 次真实登录，token 缓存在闭包变量里
    cy.request({
      method: 'POST',
      url: `${apiBase}/auth/login`,
      body: {
        email: Cypress.env('partnerEmail'),
        password: Cypress.env('testPassword'),
      },
      headers: { 'X-Forwarded-For': rndIp() },
    }).then((res) => {
      partnerToken = res.body.access_token
      partnerUser = res.body.user
    })
    cy.request({
      method: 'POST',
      url: `${apiBase}/auth/login`,
      body: {
        email: Cypress.env('testEmail'),
        password: Cypress.env('testPassword'),
      },
      headers: { 'X-Forwarded-For': rndIp() },
    }).then((res) => {
      buyerToken = res.body.access_token
      buyerUser = res.body.user
    })
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearAllSessionStorage()
  })

  /** 通过 cy.window 注入缓存的 token，跳过 /auth/login（不消耗限流配额）*/
  function injectAuth(token, user) {
    cy.window().then((win) => {
      win.localStorage.setItem('token', token)
      win.localStorage.setItem('user', JSON.stringify(user))
    })
  }

  /**
   * 拿一个 partner 名下 available 状态的商品 id。
   * 若所有商品都被前次测试遗留的 pending/confirmed 订单锁成 reserved，
   * 先用 partner 身份把这些未完成订单 cancel 掉（cancel 会把商品还原成 available）。
   */
  function getPartnerAvailableProductId() {
    function findAvailable() {
      return cy.request({
        method: 'GET',
        url: `${apiBase}/products?limit=200`,
      }).then((res) => res.body.find(
        (p) => p.seller_id === partnerUser.id && p.status === 'available'
      ))
    }

    return findAvailable().then((found) => {
      if (found) return found.id

      // 没货 → 释放 partner 名下未完结订单
      return cy.request({
        method: 'GET',
        url: `${apiBase}/orders?role=seller`,
        headers: { Authorization: `Bearer ${partnerToken}` },
      }).then((ordersRes) => {
        const stuck = ordersRes.body.filter(
          (o) => o.status === 'pending' || o.status === 'confirmed'
        )
        // Cypress 命令自动串行排队
        stuck.forEach((o) => {
          cy.request({
            method: 'PATCH',
            url: `${apiBase}/orders/${o.id}/cancel`,
            headers: { Authorization: `Bearer ${partnerToken}` },
            failOnStatusCode: false,
          })
        })
        return findAvailable().then((p) => {
          expect(p, 'partner-owned available product (after releasing stuck orders)').to.exist
          return p.id
        })
      })
    })
  }

  it('happy path: buyer places order from product detail', () => {
    cy.intercept('POST', '**/orders').as('createOrder')

    getPartnerAvailableProductId().then((productId) => {
      cy.visit('/')              // 先进任意页面让 React 启动
      injectAuth(buyerToken, buyerUser)
      cy.visit(`/products/${productId}`)

      cy.contains('button', /Buy Now/i, { timeout: 8000 }).should('be.visible')

      // 商品详情页用 window.confirm，stub 自动 OK
      cy.window().then((win) => {
        cy.stub(win, 'confirm').returns(true)
      })

      cy.contains('button', /Buy Now/i).click()

      cy.wait('@createOrder').then((interception) => {
        expect(interception.response.statusCode).to.eq(201)
        expect(interception.response.body.status).to.eq('pending')
        expect(interception.response.body.buyer_id).to.eq(buyerUser.id)
        expect(interception.response.body.seller_id).to.eq(partnerUser.id)
      })
    })
  })

  it('seller sees pending order in MyOrders → can confirm', () => {
    cy.intercept('PATCH', '**/orders/**/confirm').as('confirmOrder')

    getPartnerAvailableProductId().then((productId) => {
      // 用缓存的 buyer token 直接发订单（不再 /auth/login）
      cy.request({
        method: 'POST',
        url: `${apiBase}/orders`,
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: { product_id: productId },
      }).then((orderRes) => {
        expect(orderRes.status).to.eq(201)

        // 切到 partner（seller）的 token，访问 MyOrders
        cy.visit('/')
        injectAuth(partnerToken, partnerUser)
        cy.visit('/my-orders')

        // 切到 seller tab
        cy.contains('button', /Sold|Selling|Seller/i, { timeout: 8000 })
          .should('be.visible').click()

        // 找 Confirm 按钮
        cy.contains('button', /^Confirm$/, { timeout: 5000 })
          .should('be.visible').first().click()

        cy.wait('@confirmOrder').then((interception) => {
          expect(interception.response.statusCode).to.eq(200)
          expect(interception.response.body.status).to.eq('confirmed')
        })
      })
    })
  })

  it('full lifecycle: pending → confirmed → completed', () => {
    cy.intercept('PATCH', '**/orders/**/complete').as('completeOrder')

    getPartnerAvailableProductId().then((productId) => {
      // 1. buyer 下单
      cy.request({
        method: 'POST',
        url: `${apiBase}/orders`,
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: { product_id: productId },
      }).then((orderRes) => {
        const orderId = orderRes.body.id
        expect(orderRes.body.status).to.eq('pending')

        // 2. seller confirm（API 直接走，加快）
        cy.request({
          method: 'PATCH',
          url: `${apiBase}/orders/${orderId}/confirm`,
          headers: { Authorization: `Bearer ${partnerToken}` },
        }).then((confirmRes) => {
          expect(confirmRes.body.status).to.eq('confirmed')

          // 3. buyer 在 UI 上 complete
          cy.visit('/')
          injectAuth(buyerToken, buyerUser)
          cy.visit('/my-orders')

          cy.contains('button', /^Complete$/, { timeout: 8000 })
            .should('be.visible').first().click()

          cy.wait('@completeOrder').then((interception) => {
            expect(interception.response.statusCode).to.eq(200)
            expect(interception.response.body.status).to.eq('completed')
          })
        })
      })
    })
  })
})
