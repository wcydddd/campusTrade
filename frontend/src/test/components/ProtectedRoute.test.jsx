import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../../components/ProtectedRoute";

const apiState = vi.hoisted(() => ({
  token: null,
  me: { email: "student@uol.ac.uk", is_verified: true },
  getMe: vi.fn(),
  getStoredUser: vi.fn(() => ({ email: "student@uol.ac.uk" })),
  logout: vi.fn(),
  setStoredUser: vi.fn(),
}));

vi.mock("../../api", () => ({
  getMe: apiState.getMe,
  getStoredToken: () => apiState.token,
  getStoredUser: apiState.getStoredUser,
  logout: apiState.logout,
  setStoredUser: apiState.setStoredUser,
}));

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={["/private"]}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute>
              <div>Protected content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    apiState.token = null;
    apiState.me = { email: "student@uol.ac.uk", is_verified: true };
    apiState.getMe.mockReset();
    apiState.logout.mockReset();
    apiState.setStoredUser.mockReset();
    apiState.getStoredUser.mockReturnValue({ email: "student@uol.ac.uk" });
  });

  it("redirects unauthenticated users to the login page", async () => {
    renderProtectedRoute();

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders child content for an authenticated user", async () => {
    apiState.token = "fake-token";
    apiState.getMe.mockResolvedValue(apiState.me);

    renderProtectedRoute();

    expect(await screen.findByText("Protected content")).toBeInTheDocument();

    await waitFor(() => {
      expect(apiState.getMe).toHaveBeenCalledTimes(1);
      expect(apiState.setStoredUser).toHaveBeenCalledWith(apiState.me);
    });
  });
});
