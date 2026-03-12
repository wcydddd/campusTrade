import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { API_BASE, authFetch, logout } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUnread } from "../context/UnreadContext";
import NotificationBell from "../components/NotificationBell";
import "./Home.css";

function buildQuery(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.append(k, String(v));
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ✅ C1：统一把后端返回的相对路径补成可访问的 URL
function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  // 已经是绝对地址 / data URL
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  // 相对地址（可能是 /uploads/xxx 或 uploads/xxx）
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

function Home() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [apiCategories, setApiCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user: currentUser } = useAuth();
  const [trending, setTrending] = useState([]);
  const { unreadCount } = useUnread();

  // 筛选状态
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sustainable, setSustainable] = useState(false);

  // 获取分类
  useEffect(() => {
    let cancelled = false;
    async function fetchCategories() {
      try {
        const res = await fetch(`${API_BASE}/products/categories`);
        if (!res.ok) return;
        const data = await res.json();
        const cats = data?.categories;
        if (!cancelled) setApiCategories(Array.isArray(cats) ? cats : []);
      } catch {}
    }
    fetchCategories();
    return () => { cancelled = true; };
  }, []);

  // 获取热门榜单
  useEffect(() => {
    let cancelled = false;
    async function fetchTrending() {
      try {
        const res = await authFetch(`${API_BASE}/products/trending`);
        if (!res.ok) return;
        const list = await res.json();
        if (!cancelled && Array.isArray(list)) {
          setTrending(list.map((p) => {
            const placeholder = "https://placehold.co/400x400";
            const thumbRaw = p.thumb_url || p.thumbnail_url || "";
            const fullRaw = p.image_url || p.imageUrl || (p.images?.length ? p.images[0] : "");
            return {
              id: p.id,
              name: p.title,
              price: p.price,
              condition: p.condition || "good",
              category: p.category,
              status: p.status || "available",
              is_favorited: !!p.is_favorited,
              thumb: resolveMediaUrl(thumbRaw) || resolveMediaUrl(fullRaw) || placeholder,
              image: resolveMediaUrl(fullRaw) || resolveMediaUrl(thumbRaw) || placeholder,
            };
          }));
        }
      } catch {}
    }
    fetchTrending();
    return () => { cancelled = true; };
  }, []);

  // 获取商品
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      setLoading(true);
      setError("");

      const query = buildQuery({
        sustainable: sustainable ? true : "",
        category: category === "All" ? "" : category,
        min_price: minPrice,
        max_price: maxPrice,
        search: search.trim(),
      });

      try {
        const res = await authFetch(`${API_BASE}/products${query}`);
        if (!res.ok)
          throw new Error(`Failed to load products (HTTP ${res.status})`);
        const list = await res.json();
        if (!cancelled) {
          setProducts(Array.isArray(list) ? list : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Failed to load products");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const t = setTimeout(fetchProducts, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, category, minPrice, maxPrice, sustainable]);

  // ✅ C1：列表页要“优先 thumb_url”，并保留 image_url 给详情页用
  const normalizedProducts = useMemo(() => {
    const placeholder = "https://placehold.co/400x400";

    return products.map((p) => {
      // 兼容不同字段命名（后端可能叫 thumb_url / image_url / images）
      const thumbRaw =
        p.thumb_url ||
        p.thumbnail_url ||
        p.thumbUrl ||
        p.thumbnailUrl ||
        "";

      const fullRaw =
        p.image_url ||
        p.imageUrl ||
        (p.images?.length ? p.images[0] : "");

      const thumb = resolveMediaUrl(thumbRaw) || resolveMediaUrl(fullRaw) || placeholder;
      const image = resolveMediaUrl(fullRaw) || resolveMediaUrl(thumbRaw) || placeholder;

      return {
        id: p.id,
        name: p.title,
        price: p.price,
        condition: p.condition || "good",
        category: p.category,
        status: p.status || "available",
        is_favorited: !!p.is_favorited,
        thumb,
        image,
      };
    });
  }, [products]);

  const categories = useMemo(() => ["All", ...apiCategories], [apiCategories]);

  function clearFilters() {
    setSearch("");
    setCategory("All");
    setMinPrice("");
    setMaxPrice("");
    setSustainable(false);
  }

  // Me dropdown
  const [meMenuOpen, setMeMenuOpen] = useState(false);
  const meMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (meMenuRef.current && !meMenuRef.current.contains(e.target)) {
        setMeMenuOpen(false);
      }
    }

    if (meMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [meMenuOpen]);

  function handleLogout() {
    logout();
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

          <input
            className="search-input"
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

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

            <label
              className="filter-control"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={sustainable}
                onChange={(e) => setSustainable(e.target.checked)}
              />
              Sustainable
            </label>

            <button className="clear-btn" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>

        <div className="home-header-actions">
          <div className="me-dropdown" ref={meMenuRef}>
            <button
              type="button"
              className="me-link me-link-btn"
              onClick={(e) => {
                e.stopPropagation();
                setMeMenuOpen((v) => !v);
              }}
            >
              Me{" "}
              <span className={`me-arrow ${meMenuOpen ? "me-arrow-open" : ""}`}>
                ▼
              </span>
            </button>

            {meMenuOpen && (
              <ul className="me-dropdown-menu">
                <li>
                  <Link to="/me" onClick={() => setMeMenuOpen(false)}>
                    My profile
                  </Link>
                </li>
                <li>
                  <Link to="/my-products" onClick={() => setMeMenuOpen(false)}>
                    Manage my products
                  </Link>
                </li>
                <li>
                  <Link to="/my-orders" onClick={() => setMeMenuOpen(false)}>
                    My orders
                  </Link>
                </li>
                <li>
                  <Link to="/my-favorites" onClick={() => setMeMenuOpen(false)}>
                    My favorites
                  </Link>
                </li>
                {currentUser?.role === "admin" && (
                  <>
                    <li>
                      <Link to="/admin/review" onClick={() => setMeMenuOpen(false)}>
                        Product review
                      </Link>
                    </li>
                    <li>
                      <Link to="/admin/users" onClick={() => setMeMenuOpen(false)}>
                        User management
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>

          <NotificationBell />

          <Link to="/conversations" className="messages-link">
            Messages
            {unreadCount > 0 && (
              <span className="unread-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          <Link to="/publish" className="publish-link">
            Publish product
          </Link>

          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      {trending.length > 0 && (
        <div className="trending-section">
          <h2 className="trending-title">Trending</h2>
          <div className="trending-scroll">
            {trending.map((p) => (
              <div key={p.id} className="trending-item" onClick={() => navigate(`/products/${p.id}`)}>
                <img src={p.thumb} alt={p.name} onError={(e) => { e.currentTarget.src = "https://placehold.co/200x200"; }} />
                <p className="trending-item-name">{p.name}</p>
                <p className="trending-item-price">£{p.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="product-list">
        {loading && <p style={{ marginTop: 20 }}>Loading products...</p>}
        {error && (
          <p style={{ marginTop: 20, color: "red" }}>{error}</p>
        )}

        {!loading &&
          !error &&
          normalizedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}

        {!loading && !error && normalizedProducts.length === 0 && (
          <p style={{ marginTop: 20 }}>No products found.</p>
        )}
      </div>
    </div>
  );
}

export default Home;