import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Home from "../../pages/Home";
import Login from "../../pages/Login";
import Register from "../../pages/Register";
import ProductDetail from "../../pages/ProductDetail";
import PublishProduct from "../../pages/PublishProduct";
import Chat from "../../pages/Chat";
import MyOrders from "../../pages/MyOrders";
import MeProfile from "../../pages/MeProfile";
import MyFavorites from "../../pages/MyFavorites";
import Conversations from "../../pages/Conversations";
import OrderDetail from "../../pages/OrderDetail";
import EditProduct from "../../pages/EditProduct";
import MyProducts from "../../pages/MyProducts";
import SellerProfile from "../../pages/SellerProfile";
import AdminUsers from "../../pages/AdminUsers";
import AdminProducts from "../../pages/AdminProducts";
import AdminReview from "../../pages/AdminReview";

const {
  authState,
  unreadState,
  wsState,
  apiFns,
  mockNotificationBell,
} = vi.hoisted(() => ({
  authState: {
    user: {
      id: "user-1",
      username: "Alice",
      email: "alice@uol.ac.uk",
      role: "user",
      is_verified: true,
      avatar_url: "",
      bio: "Campus buyer and seller",
    },
    isAuthenticated: true,
    loading: false,
  },
  unreadState: {
    unreadCount: 2,
    markConversationRead: vi.fn(),
  },
  wsState: {
    lastMessage: null,
    sendMessage: vi.fn(() => true),
    isConnected: true,
  },
  apiFns: {
    authFetch: vi.fn(),
    getStoredToken: vi.fn(() => "fake-token"),
    logout: vi.fn(),
  },
  mockNotificationBell: vi.fn(() => <div data-testid="notification-bell">NotificationBell</div>),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../../context/UnreadContext", () => ({
  useUnread: () => unreadState,
}));

vi.mock("../../context/WebSocketContext", () => ({
  useWs: () => wsState,
}));

vi.mock("../../api", () => ({
  API_BASE: "http://example.test/api",
  authFetch: apiFns.authFetch,
  getStoredToken: apiFns.getStoredToken,
  logout: apiFns.logout,
  saveAuthSession: vi.fn(),
}));

vi.mock("../../components/NotificationBell", () => ({
  default: (props) => mockNotificationBell(props),
}));

vi.mock("../../components/UserCenterSidebar", () => ({
  default: () => <nav data-testid="user-center-sidebar">User Center Sidebar</nav>,
}));

vi.mock("../../components/ProductCard", () => ({
  default: ({ product }) => (
    <article data-testid="product-card">{product?.name || product?.title || "Product card"}</article>
  ),
}));

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone() {
      return jsonResponse(data, { ok, status });
    },
  };
}

function findRouteResponse(url, routes) {
  const entry = routes.find(([matcher]) =>
    matcher instanceof RegExp ? matcher.test(String(url)) : String(url).includes(matcher),
  );
  return entry ? entry[1] : null;
}

function setupNetworkMocks({ fetchRoutes = [], authRoutes = [] } = {}) {
  global.fetch = vi.fn((url) => {
    const responder = findRouteResponse(url, fetchRoutes);
    if (!responder) {
      throw new Error(`Unhandled fetch URL in smoke test: ${url}`);
    }
    return Promise.resolve(typeof responder === "function" ? responder(url) : responder);
  });

  apiFns.authFetch.mockImplementation((url) => {
    const responder = findRouteResponse(url, authRoutes);
    if (!responder) {
      throw new Error(`Unhandled authFetch URL in smoke test: ${url}`);
    }
    return Promise.resolve(typeof responder === "function" ? responder(url) : responder);
  });
}

function renderPage(ui, { route = "/", path = "/" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Page smoke tests", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authState.user = {
      id: "user-1",
      username: "Alice",
      email: "alice@uol.ac.uk",
      role: "user",
      is_verified: true,
      avatar_url: "",
      bio: "Campus buyer and seller",
    };
    authState.isAuthenticated = true;
    authState.loading = false;
    unreadState.unreadCount = 2;
    unreadState.markConversationRead.mockReset();
    wsState.lastMessage = null;
    wsState.sendMessage.mockReset();
    wsState.sendMessage.mockReturnValue(true);
    wsState.isConnected = true;
    apiFns.authFetch.mockReset();
    apiFns.getStoredToken.mockReset();
    apiFns.getStoredToken.mockReturnValue("fake-token");
    apiFns.logout.mockReset();
    mockNotificationBell.mockClear();
  });

  it("renders Home without crashing", async () => {
    setupNetworkMocks({
      fetchRoutes: [
        ["/products/categories", jsonResponse({ categories: ["Electronics"] })],
      ],
      authRoutes: [
        ["/products/trending", jsonResponse([])],
        ["/products?", jsonResponse([])],
      ],
    });

    renderPage(<Home />, { route: "/home", path: "/home" });

    expect(screen.getByPlaceholderText(/search products/i)).toBeInTheDocument();
    expect(await screen.findByText(/live listings/i)).toBeInTheDocument();
  });

  it("renders Login without crashing", () => {
    apiFns.getStoredToken.mockReturnValue(null);
    renderPage(<Login />, { route: "/login", path: "/login" });

    expect(screen.getByText("CampusTrade")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders Register without crashing", () => {
    renderPage(<Register />, { route: "/register", path: "/register" });

    expect(screen.getByPlaceholderText(/enter your university email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("renders ProductDetail without crashing", async () => {
    setupNetworkMocks({
      fetchRoutes: [
        ["/reviews/user/seller-1", jsonResponse({ as_seller: { items: [], summary: null } })],
      ],
      authRoutes: [
        ["/products/prod-1", jsonResponse({
          id: "prod-1",
          seller_id: "seller-1",
          title: "Vintage Lamp",
          price: 25,
          condition: "good",
          category: "Other",
          description: "Warm desk light",
          images: ["/lamp.jpg"],
          status: "available",
          created_at: "2026-04-01T12:00:00Z",
          views: 12,
          is_favorited: false,
        })],
        ["/auth/public/seller-1", jsonResponse({ id: "seller-1", username: "Seller Sam", avatar_url: "" })],
      ],
    });

    renderPage(<ProductDetail />, { route: "/products/prod-1", path: "/products/:id" });

    expect(await screen.findByText("Vintage Lamp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buy now/i })).toBeInTheDocument();
  });

  it("renders PublishProduct without crashing", async () => {
    setupNetworkMocks({
      fetchRoutes: [
        ["/products/categories", jsonResponse({ categories: ["Electronics", "Textbooks"] })],
      ],
      authRoutes: [
        ["/ai/usage", jsonResponse({ daily_remaining: 3 })],
      ],
    });

    renderPage(<PublishProduct />, { route: "/publish", path: "/publish" });

    expect(await screen.findByText(/publish product/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & publish/i })).toBeInTheDocument();
  });

  it("renders Chat without crashing", async () => {
    setupNetworkMocks({
      fetchRoutes: [
        ["/products/prod-1", jsonResponse({ id: "prod-1", title: "Desk Chair", price: 18, images: ["/chair.jpg"] })],
      ],
      authRoutes: [
        ["/messages?other_user_id=friend-1&limit=100&product_id=prod-1", jsonResponse([])],
        ["/messages/conversations", jsonResponse([{ other_user_id: "friend-1", other_username: "Ben", product_id: "prod-1" }])],
        ["/notifications/read-by-link", jsonResponse({ total_unread: 0 })],
      ],
    });

    renderPage(<Chat />, {
      route: "/chat/friend-1?product=prod-1",
      path: "/chat/:otherUserId",
    });

    expect(await screen.findByText("Ben")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
  });

  it("renders MyOrders without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/orders?role=buyer", jsonResponse([])],
      ],
    });

    renderPage(<MyOrders />, { route: "/my-orders", path: "/my-orders" });

    expect(await screen.findByText(/my orders/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /as buyer/i })).toBeInTheDocument();
  });

  it("renders MeProfile without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/auth/me", jsonResponse({
          username: "Alice",
          email: "alice@uol.ac.uk",
          role: "user",
          is_verified: true,
          avatar_url: "",
          bio: "Campus buyer and seller",
        })],
      ],
    });

    renderPage(<MeProfile />, { route: "/me", path: "/me" });

    expect(await screen.findByText(/^profile$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("renders MyFavorites without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/favorites", jsonResponse([])],
      ],
    });

    renderPage(<MyFavorites />, { route: "/my-favorites", path: "/my-favorites" });

    expect(await screen.findByText(/my favorites/i)).toBeInTheDocument();
    expect(screen.getByText(/no favorites yet/i)).toBeInTheDocument();
  });

  it("renders Conversations without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/messages/conversations", jsonResponse([])],
      ],
    });

    renderPage(<Conversations />, { route: "/conversations", path: "/conversations" });

    expect(await screen.findByRole("heading", { name: /^messages$/i })).toBeInTheDocument();
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });

  it("renders OrderDetail without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/orders/order-1", jsonResponse({
          id: "order-1",
          status: "pending",
          created_at: "2026-04-01T10:00:00Z",
          updated_at: "2026-04-01T10:30:00Z",
          final_price: 30,
          reviewed_by_me: false,
          reviewed_by_other: false,
          both_reviewed: false,
          buyer: { id: "user-1", username: "Alice" },
          seller: { id: "seller-1", username: "Seller Sam", email: "sam@uol.ac.uk" },
          product: {
            title: "Desk Lamp",
            price: 30,
            category: "Other",
            condition: "good",
            description: "Portable study light",
            images: ["/lamp.jpg"],
          },
        })],
      ],
    });

    renderPage(<OrderDetail />, { route: "/orders/order-1", path: "/orders/:orderId" });

    expect(await screen.findByText(/order detail/i)).toBeInTheDocument();
    expect(screen.getByText(/order info/i)).toBeInTheDocument();
  });

  it("renders EditProduct without crashing", async () => {
    setupNetworkMocks({
      fetchRoutes: [
        ["/products/categories", jsonResponse({ categories: ["Electronics"] })],
        ["/products/prod-1", jsonResponse({
          title: "Monitor",
          description: "24 inch monitor",
          price: 60,
          category: "Electronics",
          condition: "good",
          sustainable: false,
          images: [],
        })],
      ],
      authRoutes: [],
    });

    renderPage(<EditProduct />, {
      route: "/my-products/prod-1/edit",
      path: "/my-products/:id/edit",
    });

    expect(await screen.findByDisplayValue("Monitor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("renders MyProducts without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/products/user/me", jsonResponse([])],
      ],
    });

    renderPage(<MyProducts />, { route: "/my-products", path: "/my-products" });

    expect(await screen.findByText(/my products/i)).toBeInTheDocument();
    expect(screen.getByText(/you have not published any products yet/i)).toBeInTheDocument();
  });

  it("renders SellerProfile without crashing", async () => {
    setupNetworkMocks({
      fetchRoutes: [
        ["/reviews/user/seller-1", jsonResponse({
          as_seller: { summary: { total_reviews: 0, avg_rating: 0 }, items: [] },
          as_buyer: { summary: { total_reviews: 0, avg_rating: 0 }, items: [] },
        })],
      ],
      authRoutes: [
        ["/auth/public/seller-1", jsonResponse({
          id: "seller-1",
          username: "Seller Sam",
          avatar_url: "",
          is_verified: true,
          bio: "Friendly campus seller",
        })],
        ["/products/seller/seller-1", jsonResponse([])],
      ],
    });

    renderPage(<SellerProfile />, { route: "/seller/seller-1", path: "/seller/:sellerId" });

    expect(await screen.findByText("Seller Sam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /products/i })).toBeInTheDocument();
  });

  it("renders AdminUsers without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/admin/users?", jsonResponse({ items: [], total: 0, page: 1, size: 10 })],
      ],
    });

    renderPage(<AdminUsers />, { route: "/admin/users", path: "/admin/users" });

    expect(await screen.findByText(/user management/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by email or username/i)).toBeInTheDocument();
  });

  it("renders AdminProducts without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/admin/products?", jsonResponse({ items: [], total: 0, page: 1, size: 10 })],
      ],
    });

    renderPage(<AdminProducts />, { route: "/admin/products", path: "/admin/products" });

    expect(await screen.findByText(/product management/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by title/i)).toBeInTheDocument();
  });

  it("renders AdminReview without crashing", async () => {
    setupNetworkMocks({
      authRoutes: [
        ["/admin/products/pending?", jsonResponse({ items: [], total: 0, page: 1, size: 10 })],
      ],
    });

    renderPage(<AdminReview />, { route: "/admin/review", path: "/admin/review" });

    expect(await screen.findByText(/product review/i)).toBeInTheDocument();
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });
});
