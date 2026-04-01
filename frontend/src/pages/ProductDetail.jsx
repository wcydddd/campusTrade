import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { API_BASE, authFetch, logout } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUnread } from "../context/UnreadContext";
import NotificationBell from "../components/NotificationBell";
import { redirectToLogin } from "../utils/authRedirect";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";
import "./Home.css";
import "./ProductDetail.css";

const CATEGORY_DISPLAY = {
  教材: "Textbooks",
  电子产品: "Electronics",
  家具: "Furniture",
  服饰: "Clothing",
  运动器材: "Sports",
  Kitchen: "Kitchen",
  Stationery: "Stationery",
  其他: "Other",
};

// Resolve relative media URLs to absolute
function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDesc, setReportDesc] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [reporting, setReporting] = useState(false);
  const [seller, setSeller] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
  const [gallery, setGallery] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const { unreadCount } = useUnread();
  const [headerSearch, setHeaderSearch] = useState("");
  const [meMenuOpen, setMeMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const meMenuRef = useRef(null);
  const adminMenuRef = useRef(null);

  const fallbackImg =
    "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade";

  useEffect(() => {
    let cancelled = false;

    async function fetchProduct() {
      setLoading(true);
      setError("");

      try {
        const res = await authFetch(`${API_BASE}/products/${id}`);
        if (cancelled) return;

        if (!res.ok) {
          if (res.status === 404) setProduct(null);
          else setError("Failed to load product");
          return;
        }

        const data = await res.json();

        // Prefer full-size image_url (or imageUrl) for detail page
        const fullRaw =
          data.image_url ||
          data.imageUrl ||
          (data.images?.length ? data.images[0] : "");

        // Fallback to thumbnail if no full-size image available
        const thumbRaw =
          data.thumb_url ||
          data.thumbnail_url ||
          data.thumbUrl ||
          data.thumbnailUrl ||
          "";

        const imagesRaw = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
        const galleryList = imagesRaw
          .map((u) => resolveMediaUrl(u))
          .filter(Boolean);
        if (!galleryList.length) {
          const single =
            resolveMediaUrl(fullRaw) ||
            resolveMediaUrl(thumbRaw) ||
            fallbackImg;
          galleryList.push(single);
        }
        const image = galleryList[0] || fallbackImg;

        setProduct({
          id: data.id,
          seller_id: data.seller_id || data.user_id || "",
          name: data.title,
          price: data.price,
          condition: data.condition || "good",
          category: data.category,
          description: data.description,
          image,
          status: data.status || "available",
          created_at: data.created_at,
          views: data.views ?? 0,
        });
        setGallery(galleryList);
        setActiveImage(0);
        setFavorited(!!data.is_favorited);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load product");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) fetchProduct();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!product?.seller_id) return;
    let cancelled = false;
    async function fetchSeller() {
      try {
        const res = await authFetch(`${API_BASE}/auth/public/${product.seller_id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setSeller({
            id: data.id,
            username: data.username,
            avatar_url: data.avatar_url || "",
          });
        }
      } catch (_) {}
    }
    fetchSeller();
    return () => {
      cancelled = true;
    };
  }, [product?.seller_id]);

  useEffect(() => {
    if (!product?.seller_id) return;
    let cancelled = false;
    async function fetchReviews() {
      setReviewsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/reviews/user/${product.seller_id}?limit=20`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          const asSeller = data.as_seller;
          setReviews(Array.isArray(asSeller?.items) ? asSeller.items : []);
          setReviewSummary(asSeller?.summary || null);
        }
      } catch (_) {}
      finally {
        if (!cancelled) setReviewsLoading(false);
      }
    }
    fetchReviews();
    return () => { cancelled = true; };
  }, [product?.seller_id]);

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

  async function toggleFavorite() {
    if (!isAuthenticated) {
      redirectToLogin(navigate, location, "Please log in first to manage favorites.");
      return;
    }

    const prev = favorited;
    setFavorited(!prev);
    try {
      const res = await authFetch(`${API_BASE}/favorites/${id}`, {
        method: prev ? "DELETE" : "POST",
      });
      if (!res.ok) setFavorited(prev);
    } catch {
      setFavorited(prev);
    }
  }

  async function handleOrder() {
    if (!isAuthenticated) {
      redirectToLogin(navigate, location, "Please log in first to place an order.");
      return;
    }
    if (!window.confirm(`Place order for "${product.name}" at £${product.price}?`)) return;
    setOrdering(true);
    setOrderMsg("");
    try {
      const res = await authFetch(`${API_BASE}/orders`, {
        method: "POST",
        body: JSON.stringify({ product_id: product.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderMsg("Order placed successfully!");
      } else {
        setOrderMsg(data.detail || data.message || "Order failed");
      }
    } catch (e) {
      setOrderMsg(e.message || "Order failed");
    } finally {
      setOrdering(false);
    }
  }

  async function handleReport() {
    if (!isAuthenticated) {
      redirectToLogin(navigate, location, "Please log in first to report a product.");
      return;
    }
    setReporting(true);
    setReportMsg("");
    try {
      const res = await authFetch(`${API_BASE}/reports`, {
        method: "POST",
        body: JSON.stringify({ product_id: id, reason: reportReason, description: reportDesc }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReportMsg("Report submitted successfully.");
        setReportOpen(false);
        setReportDesc("");
      } else {
        setReportMsg(data.detail || "Failed to submit report");
      }
    } catch (e) {
      setReportMsg(e.message || "Failed");
    } finally {
      setReporting(false);
    }
  }

  function getShareUrl() {
    if (typeof window === "undefined") return `${API_BASE}/products/${id}`;
    return `${window.location.origin}/products/${id}`;
  }

  async function copyShareLink() {
    const url = getShareUrl();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setShareMsg("Link copied");
    } catch {
      setShareMsg("Failed to copy link");
    }
    setTimeout(() => setShareMsg(""), 1800);
  }

  async function handleShare() {
    if (!product) return;
    const url = getShareUrl();
    const shareData = {
      title: product.name,
      text: `£${product.price} · ${product.condition || "good"}`,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareMsg("Shared");
      } else {
        await copyShareLink();
        return;
      }
    } catch {
      // User may cancel native share; fallback to copy for practical use
      await copyShareLink();
      return;
    }
    setTimeout(() => setShareMsg(""), 1800);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-gray-700">{error || "Product not found"}</h2>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 bg-yellow-400 text-gray-900 rounded-full font-bold hover:bg-yellow-500 transition"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="pd-page">
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
                <button
                  type="button"
                  className="ct-nav-item ct-nav-highlight"
                  onClick={() => redirectToLogin(navigate, location, "Please log in first to publish a product.")}
                >
                  Publish
                </button>
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
                    <span className="unread-badge">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>

                <Link to="/publish" className="ct-nav-item ct-nav-highlight">Publish</Link>

                {user?.role === "admin" && (
                  <div className="admin-dropdown" ref={adminMenuRef}>
                    <button
                      type="button"
                      className="ct-nav-item"
                      onClick={(e) => { e.stopPropagation(); setAdminMenuOpen((v) => !v); setMeMenuOpen(false); }}
                    >
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
                  <button
                    type="button"
                    className="ct-nav-item ct-account-trigger"
                    onClick={(e) => { e.stopPropagation(); setMeMenuOpen((v) => !v); setAdminMenuOpen(false); }}
                  >
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt={userLabel} className="user-chip-avatar" />
                    ) : (
                      <span className="user-chip-avatar user-chip-avatar-fallback">
                        {userLabel?.[0]?.toUpperCase() || "M"}
                      </span>
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
                      <li>
                        <button type="button" className="dropdown-action" onClick={() => { setMeMenuOpen(false); handleLogout(); }}>
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

      {/* ====== Main Content ====== */}
      <div className="max-w-[1120px] mx-auto px-6 mt-5 pb-8">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* ====== Card Header: Back, Seller Info, Share, Copy ====== */}
          <div className="pd-card-header">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="pd-back-btn"
                title="Go back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {product.seller_id && (
                <button
                  onClick={() => navigate(`/seller/${product.seller_id}`)}
                  className="pd-seller-header"
                >
                  <img
                    src={seller?.avatar_url ? resolveMediaUrl(seller.avatar_url) : "https://placehold.co/40x40"}
                    alt={seller?.username || "seller"}
                    className="w-10 h-10 rounded-full object-cover bg-gray-200 flex-shrink-0"
                    onError={(e) => { e.currentTarget.src = "https://placehold.co/40x40"; }}
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate leading-tight">
                      {seller?.username || "Seller"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {reviewSummary && reviewSummary.total_reviews > 0 && (
                        <span className="text-xs text-yellow-600 font-medium">
                          ★ {reviewSummary.avg_rating}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {product.created_at
                          ? new Date(product.created_at).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                  </div>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleShare} className="pd-header-action-btn" title="Share">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
              <button onClick={copyShareLink} className="pd-header-action-btn" title="Copy link">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy
              </button>
              {shareMsg && (
                <span className={`text-xs font-semibold ml-1 ${shareMsg.toLowerCase().includes("failed") ? "text-red-500" : "text-green-600"}`}>
                  {shareMsg}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">

            {/* ====== Left Column: Image Gallery ====== */}
            <div className="lg:w-[55%] p-5">
              <div className="flex gap-3">
                {gallery.length > 1 && (
                  <div className="pd-thumb-col">
                    {gallery.map((u, idx) => (
                      <img
                        key={`${u}-${idx}`}
                        src={u}
                        alt={`thumb-${idx + 1}`}
                        onClick={() => setActiveImage(idx)}
                        className={`pd-thumb-item ${
                          idx === activeImage ? "pd-thumb-active" : "pd-thumb-inactive"
                        }`}
                      />
                    ))}
                  </div>
                )}
                <div className="pd-main-image-wrap">
                  <img
                    src={gallery[activeImage] || product.image}
                    alt={product.name}
                    loading="eager"
                    onError={(e) => {
                      if (e.currentTarget.src !== fallbackImg) {
                        e.currentTarget.src = fallbackImg;
                      }
                    }}
                    className="pd-main-image"
                  />
                </div>
              </div>
            </div>

            {/* ====== Right Column: Product Details (scrollable content + pinned action bar) ====== */}
            <div className="pd-right-col">

              {/* Scrollable content area */}
              <div className="pd-right-scroll">
                {/* Price */}
                <div className="flex items-baseline gap-3">
                  <span className="pd-price">£{product.price}</span>
                  {product.status === "sold" && (
                    <span className="px-2.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-bold tracking-wide">
                      SOLD
                    </span>
                  )}
                </div>

                {/* Tags + Views */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="pd-tag pd-tag-green">{product.condition}</span>
                  {product.category && (
                    <span className="pd-tag pd-tag-blue">
                      {CATEGORY_DISPLAY[product.category] ?? product.category}
                    </span>
                  )}
                  <span className="pd-views-badge">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {product.views ?? 0}
                  </span>
                </div>

                {/* Title */}
                <h1 className="text-xl font-bold text-gray-900 mt-4 leading-snug line-clamp-2">
                  {product.name}
                </h1>

                {/* Description */}
                {product.description && (
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mt-3">
                    {product.description}
                  </p>
                )}

                {/* Meta info grid */}
                <div className="pd-meta-grid">
                  <div className="pd-meta-item">
                    <span className="pd-meta-label">Condition</span>
                    <span className="pd-meta-value">{product.condition}</span>
                  </div>
                  {product.category && (
                    <div className="pd-meta-item">
                      <span className="pd-meta-label">Category</span>
                      <span className="pd-meta-value">
                        {CATEGORY_DISPLAY[product.category] ?? product.category}
                      </span>
                    </div>
                  )}
                  <div className="pd-meta-item">
                    <span className="pd-meta-label">Listed</span>
                    <span className="pd-meta-value">
                      {product.created_at
                        ? new Date(product.created_at).toLocaleDateString()
                        : "Unknown"}
                    </span>
                  </div>
                  <div className="pd-meta-item">
                    <span className="pd-meta-label">Status</span>
                    <span className="pd-meta-value capitalize">{product.status}</span>
                  </div>
                </div>
              </div>

              {/* ====== Pinned bottom action bar — always visible ====== */}
              <div className="pd-action-bar-pinned">
                {/* Favorite */}
                {(!user || user.id !== product.seller_id) && (
                  <button
                    onClick={toggleFavorite}
                    className={`pd-action-fav ${favorited ? "pd-action-fav-active" : ""}`}
                    title={
                      isAuthenticated
                        ? (favorited ? "Remove from favorites" : "Add to favorites")
                        : "Please log in first to manage favorites"
                    }
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span className="text-xs mt-0.5">{favorited ? "Saved" : "Save"}</span>
                  </button>
                )}

                {/* Chat */}
                {product.seller_id && (!user || user.id !== product.seller_id) && (
                  <button
                    onClick={() => {
                      if (!isAuthenticated) {
                        redirectToLogin(navigate, location, "Please log in first to contact the seller.");
                        return;
                      }
                      navigate(`/chat/${product.seller_id}?product=${product.id}`);
                    }}
                    className="pd-action-chat"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Message
                  </button>
                )}

                {/* Buy Now */}
                {product.status !== "sold" && (!user || user.id !== product.seller_id) && (
                  <button
                    onClick={handleOrder}
                    disabled={ordering}
                    className={`pd-action-buy ${ordering ? "pd-action-buy-disabled" : ""}`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                    </svg>
                    {ordering ? "Placing..." : "Buy Now"}
                  </button>
                )}

                {/* Status message */}
                {orderMsg && (
                  <p className={`pd-action-msg ${orderMsg.includes("success") ? "text-green-600" : "text-red-500"}`}>
                    {orderMsg}
                  </p>
                )}
              </div>

              {/* Guest / owner hint below action bar */}
              {!isAuthenticated && (
                <p className="text-xs text-gray-400 text-center px-4 pb-3">
                  Browsing as guest. Log in to save, buy, message, or report.
                </p>
              )}
              {user && product.seller_id && user.id === product.seller_id && (
                <p className="text-xs text-gray-400 italic text-center px-4 pb-3">
                  This is your product.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ====== Report Section ====== */}
        {product.seller_id && (!user || user.id !== product.seller_id) && (
          <div className="text-center mt-5 pb-2">
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  redirectToLogin(navigate, location, "Please log in first to report a product.");
                  return;
                }
                setReportOpen(!reportOpen);
              }}
              className="text-xs text-gray-400 underline hover:text-gray-600 transition"
            >
              Report this product
            </button>

            {isAuthenticated && reportOpen && (
              <div className="mt-3 max-w-lg mx-auto p-5 bg-white rounded-2xl shadow-sm text-left">
                <label className="block mb-2 text-sm font-semibold text-gray-700">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 mb-3 text-sm bg-gray-50 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition"
                >
                  <option value="spam">Spam</option>
                  <option value="fraud">Fraud / Scam</option>
                  <option value="inappropriate">Inappropriate content</option>
                  <option value="prohibited_item">Prohibited item</option>
                  <option value="wrong_category">Wrong category</option>
                  <option value="other">Other</option>
                </select>
                <label className="block mb-2 text-sm font-semibold text-gray-700">Description (optional)</label>
                <textarea
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Provide more details..."
                  className="w-full p-2.5 rounded-xl border border-gray-200 min-h-[70px] resize-y mb-3 text-sm bg-gray-50 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition"
                />
                <button
                  onClick={handleReport}
                  disabled={reporting}
                  className={`px-5 py-2.5 text-sm font-semibold text-white rounded-full transition ${
                    reporting ? "bg-red-400 cursor-not-allowed" : "bg-red-500 hover:bg-red-600"
                  }`}
                >
                  {reporting ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            )}
            {reportMsg && (
              <p className={`mt-2 text-xs ${reportMsg.includes("success") ? "text-green-600" : "text-red-500"}`}>
                {reportMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
