import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { API_BASE, authFetch, logout } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUnread } from "../context/UnreadContext";
import NotificationBell from "../components/NotificationBell";
import { redirectToLogin } from "../utils/authRedirect";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";
import { ADMIN_DROPDOWN_ITEMS } from "../adminNav";
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

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
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

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sustainable, setSustainable] = useState(false);

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

  const normalizedProducts = useMemo(() => {
    const placeholder = "https://placehold.co/400x400";

    return products.map((p) => {
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
    { to: "/reviews", label: "Reviews" },
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
      <header className="ct-header">
        <div className="ct-header-inner">
          <div className="ct-brand">
            <img
              src={campusTradeLogo}
              alt="CampusTrade logo"
              className="ct-brand-logo"
            />
            <span className="ct-brand-name">CampusTrade</span>
          </div>

          <div className="ct-search">
            <svg className="ct-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="ct-search-input"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="ct-search-btn" onClick={clearFilters}>
              Clear
            </button>
          </div>

          <nav className="ct-nav">
            {!authLoading && !isAuthenticated && (
              <>
                <Link to="/login" className="ct-nav-item">Login</Link>
                <Link to="/register" className="ct-nav-item">Register</Link>
                <button
                  type="button"
                  className="ct-nav-item ct-nav-highlight"
                  onClick={() => requireLogin("Please log in first to publish a product.")}
                >
                  Publish
                </button>
              </>
            )}

            {isAuthenticated && (
              <>
                <NotificationBell variant="utility" />

                <Link to="/conversations" className="ct-nav-item">
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
                  <span>Messages</span>
                  {unreadCount > 0 && (
                    <span className="unread-badge">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>

                <Link to="/publish" className="ct-nav-item ct-nav-highlight">
                  Publish
                </Link>

                {currentUser?.role === "admin" && (
                  <div className="admin-dropdown" ref={adminMenuRef}>
                    <button
                      type="button"
                      className="ct-nav-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdminMenuOpen((v) => !v);
                        setMeMenuOpen(false);
                      }}
                    >
                      <span>Admin</span>
                      <span className={`me-arrow ${adminMenuOpen ? "me-arrow-open" : ""}`}>
                        ▼
                      </span>
                    </button>

                    {adminMenuOpen && (
                      <ul className="me-dropdown-menu admin-dropdown-menu">
                        {ADMIN_DROPDOWN_ITEMS.map((item) => (
                          <li key={item.to}>
                            <Link to={item.to} onClick={() => setAdminMenuOpen(false)}>
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="me-dropdown" ref={meMenuRef}>
                  <button
                    type="button"
                    className="ct-nav-item ct-account-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMeMenuOpen((v) => !v);
                      setAdminMenuOpen(false);
                    }}
                  >
                    <UserAvatar avatarUrl={userAvatarUrl} label={userLabel} />
                    <span className="ct-account-name" title={userLabel}>{userLabel}</span>
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
                      {userQuickLinks.map((item) => (
                        <li key={item.to}>
                          <Link to={item.to} onClick={() => setMeMenuOpen(false)}>
                            {item.label}
                          </Link>
                        </li>
                      ))}
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
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="ct-main">
        <div className="ct-main-inner">
          <aside className="ct-sidebar">
            <div className="ct-sidebar-section">
              <h3 className="ct-sidebar-heading">Categories</h3>
              <ul className="ct-cat-list">
                {categories.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      className={`ct-cat-item ${category === c ? "ct-cat-active" : ""}`}
                      onClick={() => setCategory(c)}
                    >
                      <span className="ct-cat-icon" aria-hidden="true" />
                      <span className="ct-cat-label">{c}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ct-sidebar-divider" />

            <div className="ct-sidebar-section">
              <h3 className="ct-sidebar-heading">Price Range</h3>
              <div className="ct-sidebar-prices">
                <input
                  className="ct-sidebar-input"
                  type="number"
                  min="0"
                  placeholder="Min £"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
                <span className="ct-sidebar-dash">—</span>
                <input
                  className="ct-sidebar-input"
                  type="number"
                  min="0"
                  placeholder="Max £"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="ct-sidebar-divider" />

            <label className="ct-sidebar-check">
              <input
                type="checkbox"
                checked={sustainable}
                onChange={(e) => setSustainable(e.target.checked)}
              />
              <span className="ct-sidebar-eco" aria-hidden="true">🌱</span>
              Sustainable only
            </label>
          </aside>

          <div className="ct-right">
            <div className="ct-dashboard">
              {heroStats.map((item, idx) => (
                <div key={item.label} className={`ct-dash-card ct-dash-card-${idx}`}>
                  <span className="ct-dash-value">{item.value}</span>
                  <span className="ct-dash-label">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="ct-guide-strip">
              {heroGuideSteps.map((step, idx) => (
                <div key={step} className={`ct-guide-card ct-guide-card-${idx}`}>
                  <p>{step}</p>
                </div>
              ))}
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
        </div>
      </div>

      {/* Floating action bar */}
      <aside className="ct-fab">
        {isAuthenticated ? (
          <Link to="/publish" className="ct-fab-publish" title="Publish product">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Link>
        ) : (
          <button
            type="button"
            className="ct-fab-publish"
            title="Publish product"
            onClick={() => requireLogin("Please log in first to publish a product.")}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
        <span className="ct-fab-text">Publish</span>

        {isAuthenticated && (
          <>
            <div className="ct-fab-divider" />

            <Link to="/my-orders" className="ct-fab-link" title="My orders">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Orders</span>
            </Link>

            <Link to="/my-favorites" className="ct-fab-link" title="My favorites">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>Favorites</span>
            </Link>

            <Link to="/reviews" className="ct-fab-link" title="Reviews">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Reviews</span>
            </Link>

            <Link to="/recent-viewed" className="ct-fab-link" title="Recently viewed">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Recent</span>
            </Link>
          </>
        )}
      </aside>
    </div>
  );
}

export default Home;
