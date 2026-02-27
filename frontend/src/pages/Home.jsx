import { useMemo, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { API_BASE } from "../api";
import "./Home.css";

function Home() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [apiCategories, setApiCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 从后端拉取商品列表和分类
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          fetch(`${API_BASE}/products`),
          fetch(`${API_BASE}/products/categories`),
        ]);
        if (!cancelled && productsRes.ok) {
          const list = await productsRes.json();
          setProducts(list);
        }
        if (!cancelled && categoriesRes.ok) {
          const { categories: cats } = await categoriesRes.json();
          setApiCategories(Array.isArray(cats) ? cats : []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // 将后端字段映射为前端展示格式（id, name, price, condition, category, image）
  const normalizedProducts = useMemo(() => {
    return products.map((p) => ({
      id: p.id,
      name: p.title,
      price: p.price,
      condition: p.condition || "good",
      category: p.category,
      image: p.images?.length
        ? (p.images[0].startsWith("http") ? p.images[0] : `${API_BASE}${p.images[0]}`)
        : "https://placehold.co/400x400",
    }));
  }, [products]);

  // Step 6: Search
  const [search, setSearch] = useState("");

  // Step 7: Category + Price filters
  const [category, setCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const categories = useMemo(() => {
    return ["All", ...apiCategories];
  }, [apiCategories]);

  const filteredProducts = normalizedProducts.filter((product) => {
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

        <div className="home-header-actions">
          <Link to="/publish" className="publish-link">Publish product</Link>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="product-list">
        {loading && <p style={{ marginTop: 20 }}>Loading products...</p>}
        {error && <p style={{ marginTop: 20, color: "red" }}>{error}</p>}
        {!loading && !error && filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}

        {!loading && !error && filteredProducts.length === 0 && (
          <p style={{ marginTop: 20 }}>No products found.</p>
        )}
      </div>
    </div>
  );
}

export default Home;