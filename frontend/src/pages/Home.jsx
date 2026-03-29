import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { API_BASE, authFetch, logout } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUnread } from "../context/UnreadContext";
import NotificationBell from "../components/NotificationBell";
import { redirectToLogin } from "../utils/authRedirect";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";
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

function UserAvatar({ avatarUrl, label }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={label} className="user-chip-avatar" />;
  }
  return (
    <span className="user-chip-avatar user-chip-avatar-fallback">
      {label?.[0]?.toUpperCase() || "M"}
    </span>
  );
}

function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const [products, setProducts] = useState([]);
  const [apiCategories, setApiCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user: currentUser, isAuthenticated, loading: authLoading } = useAuth();
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
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (meMenuRef.current && !meMenuRef.current.contains(e.target)) {
        setMeMenuOpen(false);
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) {
        setAdminMenuOpen(false);
      }
    }

    if (meMenuOpen || adminMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [meMenuOpen, adminMenuOpen]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function requireLogin(message) {
    redirectToLogin(navigate, location, message);
  }

  const userAvatarUrl = currentUser?.avatar_url ? resolveMediaUrl(currentUser.avatar_url) : "";
  const userLabel = currentUser?.username || "Me";
  const userQuickLinks = [
    { to: "/my-orders", label: "My orders" },
    { to: "/my-favorites", label: "My favorites" },
    { to: "/my-reviews", label: "My reviews" },
    { to: "/recent-viewed", label: "Recently viewed" },
  ];
  const heroStats = [
    { label: "Live listings", value: normalizedProducts.length },
    { label: "Categories", value: apiCategories.length },
    { label: "Sustainable", value: products.filter((p) => Boolean(p.sustainable)).length },
    { label: "Trending", value: trending.length },
  ];
  const heroGuideSteps = [
    "Discover useful second-hand items on campus.",
    "Filter by category, price, and sustainability.",
    "Connect with nearby students and trade easily.",
  ];

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-head">
          <div className="home-intro">
            <div className="home-intro-main">
              <div className="home-intro-copy">
                <h1 className="home-title">CampusTrade Marketplace</h1>
                <p className="home-subtitle">
                  Buy / sell / exchange items within your campus.
                </p>
              </div>

              <div className="home-hero-logo">
                <img
                  src={campusTradeLogo}
                  alt="CampusTrade logo"
                  className="home-hero-logo-image"
                />
              </div>
            </div>
          </div>

          <div className="home-topbar">
            <div className="home-header-actions">
              {!authLoading && !isAuthenticated && (
                <div className="home-topbar-layout home-topbar-layout-guest">
                  <div className="home-utility-grid home-utility-grid-guest">
                    <Link to="/login" className="home-utility-link">
                      <span className="home-nav-link-text">Login</span>
                    </Link>
                    <Link to="/register" className="home-utility-link">
                      <span className="home-nav-link-text">Register</span>
                    </Link>
                    <button
                      type="button"
                      className="home-utility-link home-utility-button"
                      onClick={() => requireLogin("Please log in first to publish a product.")}
                    >
                      <span className="home-nav-link-text">Publish product</span>
                    </button>
                  </div>
                </div>
              )}

              {isAuthenticated && (
                <div className="home-header-toolbar">
                  <div className="home-topbar-layout">
                    <div className="home-utility-grid">
                      <NotificationBell variant="utility" />

                      <Link to="/conversations" className="home-utility-link">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="home-nav-link-text">Messages</span>
                        {unreadCount > 0 && (
                          <span className="unread-badge">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </Link>

                      <Link to="/publish" className="home-utility-link">
                        <span className="home-nav-link-text">Publish product</span>
                      </Link>

                      {userQuickLinks.map((item) => (
                        <Link key={item.to} to={item.to} className="home-utility-link">
                          <span className="home-nav-link-text">{item.label}</span>
                        </Link>
                      ))}
                    </div>

                    <div className="home-menu-rail">
                      {currentUser?.role === "admin" && (
                        <div className="admin-dropdown" ref={adminMenuRef}>
                          <button
                            type="button"
                            className="header-menu-trigger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdminMenuOpen((v) => !v);
                              setMeMenuOpen(false);
                            }}
                          >
                            <span className="header-menu-icon" aria-hidden="true">
                              ⚙
                            </span>
                            <span className="header-menu-copy">
                              <span className="header-menu-label">Admin</span>
                              <span className="header-menu-name">Management</span>
                            </span>
                            <span className={`me-arrow ${adminMenuOpen ? "me-arrow-open" : ""}`}>
                              ▼
                            </span>
                          </button>

                          {adminMenuOpen && (
                            <ul className="me-dropdown-menu admin-dropdown-menu">
                              <li>
                                <Link to="/admin/review" onClick={() => setAdminMenuOpen(false)}>
                                  Product review
                                </Link>
                              </li>
                              <li>
                                <Link to="/admin/users" onClick={() => setAdminMenuOpen(false)}>
                                  User management
                                </Link>
                              </li>
                            </ul>
                          )}
                        </div>
                      )}

                      <div className="me-dropdown" ref={meMenuRef}>
                        <button
                          type="button"
                          className="user-menu-trigger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMeMenuOpen((v) => !v);
                            setAdminMenuOpen(false);
                          }}
                        >
                          <UserAvatar avatarUrl={userAvatarUrl} label={userLabel} />
                          <span className="user-menu-copy">
                            <span className="user-menu-label">Account</span>
                            <span className="user-menu-name">{userLabel}</span>
                          </span>
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
                            <li className="me-dropdown-divider" />
                            <li>
                              <button
                                type="button"
                                className="dropdown-action"
                                onClick={() => {
                                  setMeMenuOpen(false);
                                  handleLogout();
                                }}
                              >
                                Log out
                              </button>
                            </li>
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="home-hero-body">
          <div className="home-filter-panel">
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

          <div className="hero-info-panel">
            <div className="hero-info-head">
              <span className="hero-info-eyebrow">Campus marketplace</span>
              <h2 className="hero-info-title">Student trading, campus-first.</h2>
              <p className="hero-info-text">
                Browse affordable second-hand essentials, exchange with nearby students, and keep
                good items in circulation longer.
              </p>
            </div>

            <div className="hero-info-stats">
              {heroStats.map((item) => (
                <div key={item.label} className="hero-info-stat">
                  <span className="hero-info-stat-value">{item.value}</span>
                  <span className="hero-info-stat-label">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="hero-info-detail">
              <div className="hero-info-detail-head">
                <span className="hero-info-detail-title">How it works</span>
                <p className="hero-info-detail-text">
                  A simple path from browsing to a smooth campus exchange.
                </p>
              </div>

              <div className="hero-info-notes">
                {heroGuideSteps.map((item) => (
                  <div key={item} className="hero-info-note">
                    <span className="hero-info-note-dot" aria-hidden="true" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
