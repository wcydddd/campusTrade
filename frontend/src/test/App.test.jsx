import { render, screen, waitFor } from "@testing-library/react";

const { storedUserState, apiMocks } = vi.hoisted(() => ({
  storedUserState: { value: null },
  apiMocks: {
    getStoredToken: vi.fn(),
    getStoredUser: vi.fn(),
    getMe: vi.fn(),
    logout: vi.fn(),
    setStoredUser: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  getStoredToken: apiMocks.getStoredToken,
  getStoredUser: apiMocks.getStoredUser,
  getMe: apiMocks.getMe,
  logout: apiMocks.logout,
  setStoredUser: apiMocks.setStoredUser,
}));

vi.mock("../pages/Home", () => ({
  default: () => <h1>Home Page</h1>,
}));

vi.mock("../pages/ProductDetail", () => ({
  default: () => <div>Product Detail Page</div>,
}));

vi.mock("../pages/SellerProfile", () => ({
  default: () => <div>Seller Profile Page</div>,
}));

vi.mock("../pages/PublishProduct", () => ({
  default: () => <div>Publish Product Page</div>,
}));

vi.mock("../pages/MyProducts", () => ({
  default: () => <div>My Products Page</div>,
}));

vi.mock("../pages/EditProduct", () => ({
  default: () => <div>Edit Product Page</div>,
}));

vi.mock("../pages/MeProfile", () => ({
  default: () => <div>Me Profile Page</div>,
}));

vi.mock("../pages/MyOrders", () => ({
  default: () => <div>My Orders Page</div>,
}));

vi.mock("../pages/OrderDetail", () => ({
  default: () => <div>Order Detail Page</div>,
}));

vi.mock("../pages/MyFavorites", () => ({
  default: () => <div>My Favorites Page</div>,
}));

vi.mock("../pages/RecentViewed", () => ({
  default: () => <div>Recent Viewed Page</div>,
}));

vi.mock("../pages/MyReviews", () => ({
  default: () => <div>My Reviews Page</div>,
}));

vi.mock("../pages/AdminUsers", () => ({
  default: () => <div>Admin Users Page</div>,
}));

vi.mock("../pages/AdminProducts", () => ({
  default: () => <div>Admin Products Page</div>,
}));

vi.mock("../pages/AdminReports", () => ({
  default: () => <div>Admin Reports Page</div>,
}));

vi.mock("../pages/AdminReview", () => ({
  default: () => <div>Admin Review Page</div>,
}));

vi.mock("../pages/ChangePassword", () => ({
  default: () => <div>Change Password Page</div>,
}));

vi.mock("../pages/Chat", () => ({
  default: () => <div>Chat Page</div>,
}));

vi.mock("../pages/Conversations", () => ({
  default: () => <div>Conversations Page</div>,
}));

vi.mock("../pages/Login", () => ({
  default: () => <h1>Login Page</h1>,
}));

vi.mock("../pages/Register", () => ({
  default: () => <h1>Register Page</h1>,
}));

vi.mock("../pages/VerifyEmail", () => ({
  default: () => <div>Verify Email Page</div>,
}));

vi.mock("../pages/ForgotPassword", () => ({
  default: () => <div>Forgot Password Page</div>,
}));

vi.mock("../pages/ResetPassword", () => ({
  default: () => <div>Reset Password Page</div>,
}));

import App from "../App";

function setRoute(path) {
  window.history.pushState({}, "", path);
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storedUserState.value = null;

    apiMocks.getStoredToken.mockReset();
    apiMocks.getStoredUser.mockReset();
    apiMocks.getMe.mockReset();
    apiMocks.logout.mockReset();
    apiMocks.setStoredUser.mockReset();

    apiMocks.getStoredToken.mockImplementation(() => localStorage.getItem("token"));
    apiMocks.getStoredUser.mockImplementation(() => storedUserState.value);
    apiMocks.getMe.mockResolvedValue({
      id: "user-1",
      username: "alice",
      role: "user",
      is_verified: true,
    });
    apiMocks.setStoredUser.mockImplementation((user) => {
      storedUserState.value = user;
    });

    setRoute("/");
  });

  it.each(["/", "/home"])("renders the Home page for %s", async (path) => {
    setRoute(path);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home Page" })).toBeInTheDocument();
    if (path === "/") {
      await waitFor(() => expect(window.location.pathname).toBe("/home"));
    }
  });

  it("renders the Login page for /login", async () => {
    setRoute("/login");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Login Page" })).toBeInTheDocument();
  });

  it("renders the Register page for /register", async () => {
    setRoute("/register");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Register Page" })).toBeInTheDocument();
  });

  it("redirects unauthenticated users from a protected route to login", async () => {
    setRoute("/publish");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Login Page" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
  });

  it("blocks non-admin users from admin routes as implemented", async () => {
    localStorage.setItem("token", "token-123");
    storedUserState.value = { id: "user-1", role: "user", is_verified: true };
    apiMocks.getMe.mockResolvedValue(storedUserState.value);
    setRoute("/admin/users");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home Page" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
  });

  it("falls back to home for unknown routes", async () => {
    setRoute("/does-not-exist");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home Page" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
  });
});
