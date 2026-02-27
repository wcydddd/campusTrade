import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import "./Home.css";

// 假数据（以后这里会换成后端 API）
const mockProducts = [
  {
    id: 1,
    name: "MacBook Pro 2020",
    price: 480,
    condition: "Like New",
    category: "Electronics",
    image: "https://placehold.co/400x400",
  },
  {
    id: 2,
    name: "Calculus Textbook",
    price: 25,
    condition: "Used",
    category: "Books",
    image: "https://placehold.co/400x400",
  },
  {
    id: 3,
    name: "Desk Lamp",
    price: 10,
    condition: "Good",
    category: "Home",
    image: "https://placehold.co/400x400",
  },
];

function Home() {
  const navigate = useNavigate();

  // Step 6: Search
  const [search, setSearch] = useState("");

  // Step 7: Category + Price filters
  const [category, setCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const categories = useMemo(() => {
    const set = new Set(mockProducts.map((p) => p.category));
    return ["All", ...Array.from(set)];
  }, []);

  const filteredProducts = mockProducts.filter((product) => {
    const matchSearch = product.name
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchCategory = category === "All" || product.category === category;

    const minOk = minPrice === "" || product.price >= Number(minPrice);
    const maxOk = maxPrice === "" || product.price <= Number(maxPrice);

    return matchSearch && matchCategory && minOk && maxOk;
  });

  function clearFilters() {
    setSearch("");
    setCategory("All");
    setMinPrice("");
    setMaxPrice("");
  }

  // Step 8: Logout
  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div className="home">
      <div className="home-header">
        <div>
          <h1 className="home-title">CampusTrade Marketplace</h1>
          <p className="home-subtitle">
            Buy / sell / exchange items within your campus.
          </p>

          {/* Search */}
          <input
            className="search-input"
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Filters */}
          <div className="filters-row">
            <select
              className="filter-control"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <input
              className="filter-control"
              type="number"
              min="0"
              placeholder="Min £"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />

            <input
              className="filter-control"
              type="number"
              min="0"
              placeholder="Max £"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />

            <button className="clear-btn" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>

        {/* ✅ Logout 按钮 */}
        <button className="logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <div className="product-list">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}

        {filteredProducts.length === 0 && (
          <p style={{ marginTop: 20 }}>No products found.</p>
        )}
      </div>
    </div>
  );
}

export default Home;