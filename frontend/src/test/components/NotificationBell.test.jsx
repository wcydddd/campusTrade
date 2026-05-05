import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "../../components/NotificationBell";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate, mockAuthFetch, authState, wsState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockAuthFetch: vi.fn(),
  authState: { isAuthenticated: true },
  wsState: { lastMessage: null },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../../context/WebSocketContext", () => ({
  useWs: () => wsState,
}));

vi.mock("../../api", () => ({
  API_BASE: "http://example.test/api",
  authFetch: mockAuthFetch,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function mockNotificationResponse(items) {
  return {
    ok: true,
    json: async () => items,
  };
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    wsState.lastMessage = null;
    mockNavigate.mockReset();
    mockAuthFetch.mockReset();
  });

  it("renders the unread count and opens the notification list", async () => {
    const user = userEvent.setup();
    mockAuthFetch.mockResolvedValue(
      mockNotificationResponse([
        {
          id: 1,
          type: "product_review",
          title: "Listing update",
          body: "Your listing was reviewed.",
          read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          type: "new_order",
          title: "Hidden chat alert",
          body: "Should be excluded from bell count.",
          read: false,
          created_at: new Date().toISOString(),
        },
      ]),
    );

    renderBell();

    const bellButton = await screen.findByRole("button", { name: /notifications/i });

    await waitFor(() => {
      expect(within(bellButton).getByText("1")).toBeInTheDocument();
    });

    await user.click(bellButton);

    expect(await screen.findByText("Listing update")).toBeInTheDocument();
    expect(screen.queryByText("Hidden chat alert")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no notifications", async () => {
    const user = userEvent.setup();
    mockAuthFetch.mockResolvedValue(mockNotificationResponse([]));

    renderBell();

    await user.click(await screen.findByRole("button", { name: /notifications/i }));

    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();
  });
});
