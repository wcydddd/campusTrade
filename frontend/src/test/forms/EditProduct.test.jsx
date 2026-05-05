import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditProduct from "../../pages/EditProduct";
import { renderWithRouter } from "../renderWithRouter";

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

function createDeferredResponse(data = {}) {
  let resolve;
  const promise = new Promise((res) => {
    resolve = () =>
      res({
        ok: true,
        status: 200,
        json: async () => data,
      });
  });
  return { promise, resolve };
}

describe("EditProduct form validation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function mockInitialFetches() {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/products/categories")) {
        return mockJsonResponse({ categories: ["Electronics", "Textbooks"] });
      }
      if (String(url).includes("/products/123")) {
        return mockJsonResponse({
          title: "Original title",
          description: "Original description",
          price: 25,
          category: "Electronics",
          condition: "good",
          sustainable: false,
          images: [],
        });
      }
      if (String(url).includes("/products/123/images/upload")) {
        return mockJsonResponse({ images: [] });
      }
      return mockJsonResponse({});
    });
  }

  it("requires the title field before saving", async () => {
    const user = userEvent.setup();
    mockInitialFetches();
    renderWithRouter(<EditProduct />, {
      route: "/my-products/123/edit",
      path: "/my-products/:id/edit",
    });

    const titleInput = await screen.findByDisplayValue("Original title");
    await user.clear(titleInput);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/please enter a title/i)).toBeInTheDocument();
  });

  it("shows saving state while a valid update is in progress", async () => {
    const user = userEvent.setup();
    mockInitialFetches();
    const deferred = createDeferredResponse({});

    global.fetch = vi.fn((url, options) => {
      if (String(url).includes("/products/categories")) {
        return mockJsonResponse({ categories: ["Electronics", "Textbooks"] });
      }
      if (String(url).includes("/products/123") && (!options || options.method === undefined)) {
        return mockJsonResponse({
          title: "Original title",
          description: "Original description",
          price: 25,
          category: "Electronics",
          condition: "good",
          sustainable: false,
          images: [],
        });
      }
      if (String(url).includes("/products/123") && options?.method === "PUT") {
        return deferred.promise;
      }
      return mockJsonResponse({});
    });

    renderWithRouter(<EditProduct />, {
      route: "/my-products/123/edit",
      path: "/my-products/:id/edit",
    });

    await screen.findByDisplayValue("Original title");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("button", { name: /saving/i })).toBeDisabled();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    });
  });
});
