/**
 * CA2 Plan Table I — Workflow #4: Search
 *
 * Verifies that the search bar on Home queries the backend with filters
 * and renders the matching products.
 */
describe('Search workflow', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
  })

  it('home page renders product list from /products', () => {
    cy.intercept('GET', '**/products**').as('listProducts')
    cy.visit('/')
    cy.wait('@listProducts').then((interception) => {
      expect(interception.response.statusCode).to.eq(200)
      expect(interception.response.body).to.have.length.greaterThan(0)
    })
  })

  it('search keyword triggers API call with search param', () => {
    cy.intercept('GET', '**/products**').as('listProducts')
    cy.visit('/')
    cy.wait('@listProducts')

    // 输入关键词，每次 onChange 都会触发新的请求
    cy.get('input[placeholder*="Search"]').first().type('Test')

    // 等到带 search=Test 的请求出现
    cy.wait('@listProducts', { timeout: 10000 })
    cy.get('@listProducts.all').should((interceptions) => {
      // 至少有一条请求 URL 包含 search=Test
      const matched = interceptions.some((i) =>
        /search=Test/i.test(i.request.url)
      )
      expect(matched, 'expected at least one request with search=Test').to.be.true
    })
  })

  it('price range inputs trigger filtered API call', () => {
    cy.intercept('GET', '**/products**').as('listProducts')
    cy.visit('/')
    cy.wait('@listProducts')

    cy.get('input[placeholder*="Min"]').first().type('20')
    cy.get('input[placeholder*="Max"]').first().type('80')

    // 让 React 把所有 onChange 都跑完
    cy.wait(2000)

    cy.get('@listProducts.all').should((interceptions) => {
      const hasMin = interceptions.some((i) => /min_price=20/i.test(i.request.url))
      const hasMax = interceptions.some((i) => /max_price=80/i.test(i.request.url))
      expect(hasMin, 'expected request with min_price=20').to.be.true
      expect(hasMax, 'expected request with max_price=80').to.be.true
    })
  })
})
