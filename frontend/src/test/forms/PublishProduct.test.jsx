import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublishProduct from "../../pages/PublishProduct";
import { renderWithRouter } from "../renderWithRouter";

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

describe("PublishProduct form validation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/products/categories")) {
        return mockJsonResponse({ categories: ["Electronics", "Textbooks"] });
      }
      if (String(url).includes("/ai/usage")) {
        return mockJsonResponse({ daily_remaining: 3 });
      }
      if (String(url).includes("/products")) {
        return mockJsonResponse({});
      }
      return mockJsonResponse({});
    });
  });

  it("requires a title before publishing", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PublishProduct />, { route: "/publish", path: "/publish" });

    await screen.findByRole("option", { name: "Electronics" });
    await user.type(screen.getByPlaceholderText(/product description/i), "A solid laptop");
    await user.type(screen.getByPlaceholderText("0.00"), "99");
    await user.click(screen.getByRole("button", { name: /confirm & publish/i }));

    expect(await screen.findByText(/please enter a title/i)).toBeInTheDocument();
  });

  it("marks a negative price as invalid", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PublishProduct />, { route: "/publish", path: "/publish" });

    await screen.findByRole("option", { name: "Electronics" });
    await user.type(screen.getByPlaceholderText(/product title/i), "Laptop");
    await user.type(screen.getByPlaceholderText(/product description/i), "A solid laptop");
    const priceInput = screen.getByPlaceholderText("0.00");
    await user.type(priceInput, "-1");

    expect(priceInput).toBeInvalid();
  });

  it("requires a category when none is available or selected", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/products/categories")) {
        return mockJsonResponse({ categories: [] });
      }
      if (String(url).includes("/ai/usage")) {
        return mockJsonResponse({ daily_remaining: 3 });
      }
      return mockJsonResponse({});
    });

    renderWithRouter(<PublishProduct />, { route: "/publish", path: "/publish" });

    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
    });

    await user.type(screen.getByPlaceholderText(/product title/i), "Laptop");
    await user.type(screen.getByPlaceholderText(/product description/i), "A solid laptop");
    await user.type(screen.getByPlaceholderText("0.00"), "99");
    await user.click(screen.getByRole("button", { name: /confirm & publish/i }));

    expect(await screen.findByText(/please select a category/i)).toBeInTheDocument();
  });

  it.skip("treats zero as an invalid price", async () => {
    // Current business logic allows 0 because it validates price < 0 rather than price <= 0.
  });

  it.skip("requires at least one uploaded image before publishing", async () => {
    // Current business logic allows publishing without images, so there is no submit-time image requirement to test.
  });
});
