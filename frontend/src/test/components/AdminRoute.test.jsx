import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminRoute from "../../components/AdminRoute";

const apiState = vi.hoisted(() => ({
  getStoredUser: vi.fn(),
}));

vi.mock("../../api", () => ({
  getStoredUser: apiState.getStoredUser,
}));

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <div>Admin panel</div>
            </AdminRoute>
          }
        />
        <Route path="/home" element={<div>Home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminRoute", () => {
  beforeEach(() => {
    apiState.getStoredUser.mockReset();
  });

  it("redirects non-admin users away from the route", async () => {
    apiState.getStoredUser.mockReturnValue({ role: "user" });

    renderAdminRoute();

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(screen.queryByText("Admin panel")).not.toBeInTheDocument();
  });

  it("allows admin users to view the protected content", async () => {
    apiState.getStoredUser.mockReturnValue({ role: "admin" });

    renderAdminRoute();

    expect(await screen.findByText("Admin panel")).toBeInTheDocument();
  });
});
