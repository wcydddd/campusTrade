import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserCenterSidebar from "../../components/UserCenterSidebar";

function renderSidebar(route = "/my-orders") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UserCenterSidebar />
    </MemoryRouter>,
  );
}

describe("UserCenterSidebar", () => {
  it("renders the main menu sections and links", () => {
    renderSidebar();

    expect(screen.getByText("My Transactions")).toBeInTheDocument();
    expect(screen.getByText("My Interests")).toBeInTheDocument();
    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage my products/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my orders/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my profile/i })).toBeInTheDocument();
  });

  it("marks the current route as active", () => {
    renderSidebar("/my-orders");

    const activeLink = screen.getByRole("link", { name: /my orders/i });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink.className).toContain("font-bold");
  });
});
