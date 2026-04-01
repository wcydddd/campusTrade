import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE, authFetch, logout } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUnread } from "../context/UnreadContext";
import NotificationBell from "../components/NotificationBell";
import ProductCard from "../components/ProductCard";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";
import "./Home.css";
import "./SellerProfile.css";

function SpReviewStars({ value, size = 18 }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <div className="sp-review-avg-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24" fill={s <= rounded ? "#fbbf24" : "none"} stroke="#fbbf24" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function SpReviewSection({ title, description, roleShort, summary, items }) {
  const n = summary?.total_reviews ?? 0;
  const avg = n > 0 ? Number(summary.avg_rating) : 0;
  return (
    <section className="sp-review-rep-section">
      <h3 className="sp-review-rep-heading">{title}</h3>
      {description ? <p className="sp-review-rep-desc">{description}</p> : null}
      {n > 0 ? (
        <div className="sp-review-summary sp-review-summary--compact">
          <div className="sp-review-avg sp-review-avg--row">
            <span className="sp-review-avg-num sp-review-avg-num--sm">{avg.toFixed(1)}</span>
            <div>
              <SpReviewStars value={avg} size={16} />
              <span className="sp-review-count">
                {n} review{n !== 1 ? "s" : ""} as {roleShort}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="sp-review-rep-empty">No reviews in this role yet.</p>
      )}
      {items?.length ? (
        <div className="sp-review-list sp-review-list--tight">
          {items.map((r) => (
            <div key={r.id} className="sp-review-card">
              <div className="sp-review-header">
                <div className="sp-review-user">
                  <div className="sp-review-avatar">{(r.reviewer_username || "U")[0].toUpperCase()}</div>
                  <div>
                    <p className="sp-review-username">{r.reviewer_username || "User"}</p>
                    <div className="sp-review-stars-sm">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill={s <= r.rating ? "#fbbf24" : "none"} stroke="#fbbf24" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="sp-review-date">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="sp-review-comment">
                {r.comment || <em className="sp-review-nocomment">No comment</em>}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function SellerProfile() {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { unreadCount } = useUnread();

  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("products");

  const [headerSearch, setHeaderSearch] = useState("");
  const [meMenuOpen, setMeMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const meMenuRef = useRef(null);
  const adminMenuRef = useRef(null);

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [sellerRes, productsRes, repRes] = await Promise.all([
          authFetch(`${API_BASE}/auth/public/${sellerId}`),
          authFetch(`${API_BASE}/products/seller/${sellerId}`),
          fetch(`${API_BASE}/reviews/user/${sellerId}?limit=10`),
        ]);

        if (!sellerRes.ok) {
          const d = await sellerRes.json().catch(() => ({}));
          throw new Error(d.detail || "Seller not found");
        }
        if (!productsRes.ok) {
          const d = await productsRes.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to load seller products");
        }

        const sellerData = await sellerRes.json();
        const list = await productsRes.json();
        const repData = repRes.ok ? await repRes.json().catch(() => null) : null;
        if (cancelled) return;

        setSeller(sellerData);
        setProducts(Array.isArray(list) ? list : []);
        setRep(repData && repData.as_seller && repData.as_buyer ? repData : null);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load seller profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (meMenuRef.current && !meMenuRef.current.contains(e.target)) setMeMenuOpen(false);
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) setAdminMenuOpen(false);
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

  const userAvatarUrl = user?.avatar_url ? resolveMediaUrl(user.avatar_url) : "";
  const userLabel = user?.username || "Me";

  const normalizedProducts = useMemo(() => {
    const placeholder = "https://placehold.co/400x400";
    return products.map((p) => {
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
    });
  }, [products]);

  if (loading) {
    return (
      <div className="sp-page">
        <div className="sp-loading">
          <div className="sp-spinner" />
          <p>Loading seller profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sp-page">
        <div className="sp-loading">
          <p className="sp-error-text">{error}</p>
          <Link to="/home" className="sp-back-home-btn">Back to Home</Link>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="sp-page">
        <div className="sp-loading">
          <p>Seller not found.</p>
          <Link to="/home" className="sp-back-home-btn">Back to Home</Link>
        </div>
      </div>
    );
  }

  const avatar = seller.avatar_url
    ? (seller.avatar_url.startsWith("http") ? seller.avatar_url : `${API_BASE}${seller.avatar_url}`)
    : "https://placehold.co/120x120";

  const totalViews = products.reduce((sum, p) => sum + (p.views ?? 0), 0);

  const sellerSummary = rep?.as_seller?.summary;
  const buyerSummary = rep?.as_buyer?.summary;
  const totalReviewCount = (sellerSummary?.total_reviews ?? 0) + (buyerSummary?.total_reviews ?? 0);

  return (
    <div className="sp-page">
      {/* ====== Platform-wide Yellow Navigation Bar ====== */}
      <header className="ct-header">
        <div className="ct-header-inner">
          <Link to="/home" className="ct-brand" style={{ textDecoration: "none" }}>
            <img src={campusTradeLogo} alt="CampusTrade" className="ct-brand-logo" />
            <span className="ct-brand-name">CampusTrade</span>
          </Link>

          <form
            className="ct-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/home${headerSearch.trim() ? `?search=${encodeURIComponent(headerSearch.trim())}` : ""}`);
            }}
          >
            <svg className="ct-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="ct-search-input"
              placeholder="Search products..."
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
            />
            <button type="submit" className="ct-search-btn">Search</button>
          </form>

          <nav className="ct-nav">
            {!authLoading && !isAuthenticated && (
              <>
                <Link to="/login" className="ct-nav-item">Login</Link>
                <Link to="/register" className="ct-nav-item">Register</Link>
              </>
            )}
            {isAuthenticated && (
              <>
                <NotificationBell variant="utility" />
                <Link to="/conversations" className="ct-nav-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Messages</span>
                  {unreadCount > 0 && (
                    <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  )}
                </Link>
                <Link to="/publish" className="ct-nav-item ct-nav-highlight">Publish</Link>

                {user?.role === "admin" && (
                  <div className="admin-dropdown" ref={adminMenuRef}>
                    <button type="button" className="ct-nav-item" onClick={(e) => { e.stopPropagation(); setAdminMenuOpen((v) => !v); setMeMenuOpen(false); }}>
                      <span>Admin</span>
                      <span className={`me-arrow ${adminMenuOpen ? "me-arrow-open" : ""}`}>▼</span>
                    </button>
                    {adminMenuOpen && (
                      <ul className="me-dropdown-menu admin-dropdown-menu">
                        <li><Link to="/admin/review" onClick={() => setAdminMenuOpen(false)}>Product review</Link></li>
                        <li><Link to="/admin/users" onClick={() => setAdminMenuOpen(false)}>User management</Link></li>
                      </ul>
                    )}
                  </div>
                )}

                <div className="me-dropdown" ref={meMenuRef}>
                  <button type="button" className="ct-nav-item ct-account-trigger" onClick={(e) => { e.stopPropagation(); setMeMenuOpen((v) => !v); setAdminMenuOpen(false); }}>
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt={userLabel} className="user-chip-avatar" />
                    ) : (
                      <span className="user-chip-avatar user-chip-avatar-fallback">{userLabel?.[0]?.toUpperCase() || "M"}</span>
                    )}
                    <span className="ct-account-name" title={userLabel}>{userLabel}</span>
                    <span className={`me-arrow ${meMenuOpen ? "me-arrow-open" : ""}`}>▼</span>
                  </button>
                  {meMenuOpen && (
                    <ul className="me-dropdown-menu">
                      <li><Link to="/me" onClick={() => setMeMenuOpen(false)}>My profile</Link></li>
                      <li><Link to="/my-products" onClick={() => setMeMenuOpen(false)}>Manage my products</Link></li>
                      <li className="me-dropdown-divider" />
                      <li><Link to="/my-orders" onClick={() => setMeMenuOpen(false)}>My orders</Link></li>
                      <li><Link to="/my-favorites" onClick={() => setMeMenuOpen(false)}>My favorites</Link></li>
                      <li><Link to="/my-reviews" onClick={() => setMeMenuOpen(false)}>My reviews</Link></li>
                      <li><Link to="/recent-viewed" onClick={() => setMeMenuOpen(false)}>Recently viewed</Link></li>
                      <li className="me-dropdown-divider" />
                      <li><button type="button" className="dropdown-action" onClick={() => { setMeMenuOpen(false); handleLogout(); }}>Log out</button></li>
                    </ul>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ====== Layer 2 — Wide Orange Textured Banner ====== */}
      <div className="sp-banner">
        <div className="sp-banner-pattern" />
        <div className="sp-banner-wave" />
        <div className="sp-banner-inner">
          <button onClick={() => navigate(-1)} className="sp-back-btn" title="Go back">
            ← Back
          </button>

          <div className="sp-banner-profile">
            <img
              src={avatar}
              alt={seller.username || "seller"}
              className="sp-avatar"
              onError={(e) => { e.currentTarget.src = "https://placehold.co/120x120"; }}
            />
            <div className="sp-banner-info">
              <div className="sp-name-row">
                <h1 className="sp-name">{seller.username}</h1>
                {seller.is_verified && (
                  <span className="sp-verified-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                    Verified
                  </span>
                )}
              </div>
              {seller.bio && <p className="sp-bio">{seller.bio}</p>}
            </div>
          </div>

          {/* Bottom padding for stats card overlap */}
          <div style={{ height: 44 }} />
        </div>
      </div>

      {/* ====== Frosted Stats Card — overlaps banner ====== */}
      <div className="sp-stats-card">
        <div className="sp-stats-card-inner">
          <div className="sp-stat">
            <span className="sp-stat-value">{normalizedProducts.length}</span>
            <span className="sp-stat-label">Products</span>
          </div>
          <div className="sp-stat-divider" />
          <div className="sp-stat">
            <span className="sp-stat-value">{totalReviewCount}</span>
            <span className="sp-stat-label">Reviews</span>
          </div>
          <div className="sp-stat-divider" />
          <div className="sp-stat">
            <span className="sp-stat-value">
              {sellerSummary && sellerSummary.total_reviews > 0 ? sellerSummary.avg_rating.toFixed(1) : "—"}
            </span>
            <span className="sp-stat-label">As seller</span>
            <span className="sp-stat-sublabel">{sellerSummary?.total_reviews ?? 0} received</span>
          </div>
          <div className="sp-stat-divider" />
          <div className="sp-stat">
            <span className="sp-stat-value">
              {buyerSummary && buyerSummary.total_reviews > 0 ? buyerSummary.avg_rating.toFixed(1) : "—"}
            </span>
            <span className="sp-stat-label">As buyer</span>
            <span className="sp-stat-sublabel">{buyerSummary?.total_reviews ?? 0} received</span>
          </div>
          {totalViews > 0 && (
            <>
              <div className="sp-stat-divider" />
              <div className="sp-stat">
                <span className="sp-stat-value">{totalViews}</span>
                <span className="sp-stat-label">Views</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ====== Layer 3 — White Content (Tabs + Grid) ====== */}
      <div className="sp-content">
        <div className="sp-tabs">
          <button
            className={`sp-tab ${activeTab === "products" ? "sp-tab-active" : ""}`}
            onClick={() => setActiveTab("products")}
          >
            Products
            <span className="sp-tab-count">{normalizedProducts.length}</span>
          </button>
          <button
            className={`sp-tab ${activeTab === "reviews" ? "sp-tab-active" : ""}`}
            onClick={() => setActiveTab("reviews")}
          >
            Reviews
            <span className="sp-tab-count">{totalReviewCount}</span>
          </button>
        </div>

        {/* ── Products Tab ── */}
        {activeTab === "products" && (
          <div className="sp-tab-content">
            {normalizedProducts.length === 0 ? (
              <div className="sp-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="sp-empty-icon">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <p>No available products from this seller.</p>
              </div>
            ) : (
              <div className="sp-product-grid">
                {normalizedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Reviews Tab ── */}
        {activeTab === "reviews" && (
          <div className="sp-tab-content sp-tab-content--reviews">
            {!rep ? (
              <div className="sp-empty">
                <p>Reputation could not be loaded.</p>
              </div>
            ) : (
              <div className="sp-review-rep-split">
                <SpReviewSection
                  title="As seller"
                  roleShort="seller"
                  description="Ratings from buyers after completed orders."
                  summary={rep.as_seller.summary}
                  items={rep.as_seller.items}
                />
                <SpReviewSection
                  title="As buyer"
                  roleShort="buyer"
                  description="Ratings from sellers after completed orders."
                  summary={rep.as_buyer.summary}
                  items={rep.as_buyer.items}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
