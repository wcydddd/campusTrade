import { screen } from "@testing-library/react";
import Home from "../../pages/Home";
import ProductCard from "../../components/ProductCard";
import { renderWithRouter } from "../renderWithRouter";

const { authState, unreadState, mockAuthFetch, mockLogout, mockNavigate } = vi.hoisted(() => ({
  authState: {
    user: { id: "user-1", username: "Alice", role: "user" },
    isAuthenticated: true,
    loading: false,
  },
  unreadState: {
    unreadCount: 3,
  },
  mockAuthFetch: vi.fn(),
  mockLogout: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../../context/UnreadContext", () => ({
  useUnread: () => unreadState,
}));

vi.mock("../../api", () => ({
  API_BASE: "http://example.test/api",
  authFetch: mockAuthFetch,
  logout: mockLogout,
}));

vi.mock("../../components/NotificationBell", () => ({
  default: ({ variant }) => <div data-testid="notification-bell">{variant}</div>,
}));

vi.mock("../../utils/authRedirect", () => ({
  redirectToLogin: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const breakpoints = [
  { label: "mobile", width: 375, mobile: true, tablet: true, desktop: false },
  { label: "tablet", width: 768, mobile: false, tablet: true, desktop: false },
  { label: "desktop", width: 1024, mobile: false, tablet: false, desktop: true },
];

function jsonResponse(data) {
  return Promise.resolve({
    ok: true,
    json: async () => data,
  });
}

function matchesQuery(query, width) {
  const maxWidths = [...query.matchAll(/\(max-width:\s*(\d+)px\)/gi)];
  const minWidths = [...query.matchAll(/\(min-width:\s*(\d+)px\)/gi)];

  const satisfiesMax = maxWidths.every(([, value]) => width <= Number(value));
  const satisfiesMin = minWidths.every(([, value]) => width >= Number(value));

  return satisfiesMax && satisfiesMin;
}

function setViewport(width) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "outerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });

  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: matchesQuery(query, width),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  window.dispatchEvent(new Event("resize"));
}

function mockHomeRequests() {
  global.fetch = vi.fn((url) => {
    const href = String(url);
    if (href.includes("/products/categories")) {
      return jsonResponse({ categories: ["Textbooks", "Furniture"] });
    }
    throw new Error(`Unhandled fetch request in responsive test: ${href}`);
  });

  mockAuthFetch.mockImplementation((url) => {
    const href = String(url);

    if (href.includes("/products/trending")) {
      return jsonResponse([
        {
          id: "trend-1",
          title: "Trending Camera",
          price: 120,
          condition: "good",
          category: "Electronics",
          thumb_url: "/images/trending-camera.png",
          image_url: "/images/trending-camera.png",
        },
      ]);
    }

    if (href.endsWith("/products") || href.includes("/products?")) {
      return jsonResponse([
        {
          id: "prod-1",
          title: "Desk Lamp",
          price: 12,
          condition: "good",
          category: "Furniture",
          image_url: "/images/lamp.png",
        },
        {
          id: "prod-2",
          title: "Study Chair",
          price: 25,
          condition: "like new",
          category: "Furniture",
          image_url: "/images/chair.png",
        },
      ]);
    }

    throw new Error(`Unhandled authFetch request in responsive test: ${href}`);
  });
}

describe("responsive breakpoint smoke coverage", () => {
  beforeEach(() => {
    authState.user = { id: "user-1", username: "Alice", role: "user" };
    authState.isAuthenticated = true;
    authState.loading = false;
    unreadState.unreadCount = 3;
    mockAuthFetch.mockReset();
    mockLogout.mockReset();
    mockNavigate.mockReset();
  });

  it.each(breakpoints)(
    "renders ProductCard safely at the $label breakpoint",
    ({ width, mobile, tablet, desktop }) => {
      setViewport(width);

      renderWithRouter(
        <ProductCard
          product={{
            id: "prod-1",
            name: "Responsive Desk Lamp",
            price: 18.5,
            condition: "Good",
            category: "Furniture",
            status: "available",
            image: "",
            is_favorited: true,
          }}
        />,
      );

      expect(window.matchMedia("(max-width: 560px)").matches).toBe(mobile);
      expect(window.matchMedia("(max-width: 900px)").matches).toBe(tablet);
      expect(window.matchMedia("(min-width: 901px)").matches).toBe(desktop);
      expect(screen.getByText("Responsive Desk Lamp")).toBeInTheDocument();
      expect(screen.getByText(/18\.5/)).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: /responsive desk lamp/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByTitle(/remove from favorites/i),
      ).toBeInTheDocument();
    },
  );

  it.each(breakpoints)(
    "renders Home safely at the $label breakpoint",
    async ({ width, mobile, tablet, desktop }) => {
      setViewport(width);
      mockHomeRequests();

      renderWithRouter(<Home />);

      expect(window.matchMedia("(max-width: 560px)").matches).toBe(mobile);
      expect(window.matchMedia("(max-width: 900px)").matches).toBe(tablet);
      expect(window.matchMedia("(min-width: 901px)").matches).toBe(desktop);
      expect(
        screen.getByPlaceholderText(/search products/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Live listings")).toBeInTheDocument();
      expect(await screen.findByText("Desk Lamp")).toBeInTheDocument();
      expect(await screen.findByText("Study Chair")).toBeInTheDocument();
      expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
    },
  );
});
