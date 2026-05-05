import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductCard from "../../components/ProductCard";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate, mockAuthFetch, mockRedirectToLogin, authState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockAuthFetch: vi.fn(),
  mockRedirectToLogin: vi.fn(),
  authState: { isAuthenticated: true },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../../api", () => ({
  API_BASE: "http://example.test/api",
  authFetch: mockAuthFetch,
}));

vi.mock("../../utils/authRedirect", () => ({
  redirectToLogin: mockRedirectToLogin,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderCard(product, props = {}) {
  return render(
    <MemoryRouter>
      <ProductCard product={product} {...props} />
    </MemoryRouter>,
  );
}

describe("ProductCard", () => {
  const baseProduct = {
    id: "123",
    name: "Used Calculus Textbook",
    price: 9.99,
    condition: "Good",
    category: "Textbooks",
    status: "available",
    is_favorited: false,
  };

  beforeEach(() => {
    authState.isAuthenticated = true;
    mockNavigate.mockReset();
    mockAuthFetch.mockReset();
    mockRedirectToLogin.mockReset();
  });

  it("renders title, price, and fallback image", () => {
    renderCard(baseProduct);

    expect(screen.getByText("Used Calculus Textbook")).toBeInTheDocument();
    expect(screen.getByText(/9\.99/)).toBeInTheDocument();

    const image = screen.getByRole("img", { name: /used calculus textbook/i });
    expect(image.getAttribute("src")).toContain("dummyimage.com/400x400");
  });

  it("shows the favourited state and can toggle it for authenticated users", async () => {
    const user = userEvent.setup();
    mockAuthFetch.mockResolvedValue({ ok: true });

    renderCard({
      ...baseProduct,
      is_favorited: true,
    });

    const favoriteButton = screen.getByTitle(/remove from favorites/i);
    await user.click(favoriteButton);

    expect(mockAuthFetch).toHaveBeenCalledWith(
      "http://example.test/api/favorites/123",
      { method: "DELETE" },
    );
  });

  it("redirects unauthenticated users when they try to favourite an item", async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = false;

    renderCard(baseProduct);

    await user.click(screen.getByTitle(/please log in first to manage favorites/i));

    expect(mockRedirectToLogin).toHaveBeenCalledTimes(1);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("navigates to the product detail page when the card is clicked", async () => {
    const user = userEvent.setup();
    renderCard(baseProduct);

    await user.click(screen.getByText("Used Calculus Textbook"));

    expect(mockNavigate).toHaveBeenCalledWith("/products/123");
  });
});
