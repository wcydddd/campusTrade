import { useState } from "react";
import "./ProductCard.css";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { redirectToLogin } from "../utils/authRedirect";

const CATEGORY_DISPLAY = {
  教材: "Textbooks",
  电子产品: "Electronics",
  家具: "Furniture",
  服饰: "Clothing",
  运动器材: "Sports",
  其他: "Other",
  Kitchen: "Other",
  Stationery: "Other",
};

function ProductCard({ product, onUnfavorited }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [fav, setFav] = useState(!!product.is_favorited);

  const isSold = product.status === "sold";

  const categoryLabel = product.category
    ? CATEGORY_DISPLAY[product.category] ?? product.category
    : "";

  const fallbackImg =
    "https://dummyimage.com/400x400/cccccc/000000&text=CampusTrade";

  const imgSrc = product.thumb || product.image || fallbackImg;

  async function toggleFav(e) {
    e.stopPropagation();
    if (!isAuthenticated) {
      redirectToLogin(navigate, location, "Please log in first to manage favorites.");
      return;
    }

    const prev = fav;
    setFav(!prev);
    try {
      const res = await authFetch(`${API_BASE}/favorites/${product.id}`, {
        method: prev ? "DELETE" : "POST",
      });
      if (!res.ok) {
        setFav(prev);
      } else if (prev && onUnfavorited) {
        onUnfavorited(product.id);
      }
    } catch {
      setFav(prev);
    }
  }

  return (
    <div className={`product-card ${isSold ? "product-card-sold" : ""}`}>
      <div className="product-card-img-wrap">
        <img
          src={imgSrc}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== fallbackImg) {
              e.currentTarget.src = fallbackImg;
            }
          }}
        />
        {isSold && <span className="product-card-sold-badge">SOLD</span>}
      </div>

      <div className="product-card-body">
        <div className="product-card-title-row">
          <h3 className="product-card-title">{product.name}</h3>
          <button
            className={`product-card-fav ${fav ? "product-card-fav-active" : ""}`}
            onClick={toggleFav}
            title={
              isAuthenticated
                ? (fav ? "Remove from favorites" : "Add to favorites")
                : "Please log in first to manage favorites"
            }
          >
            {fav ? "♥" : "♡"}
          </button>
        </div>

        <div className="product-card-meta">
          <p className="price">£{product.price}</p>
          <span className="badge">{product.condition}</span>
        </div>

        {categoryLabel && (
          <p className="product-card-category">{categoryLabel}</p>
        )}

        <div className="product-card-actions">
          <button onClick={() => navigate(`/products/${product.id}`)}>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
