// src/components/ProductCard.jsx
import "./ProductCard.css";
import { useNavigate } from "react-router-dom";

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

function ProductCard({ product }) {
  const navigate = useNavigate();

  const categoryLabel = product.category
    ? CATEGORY_DISPLAY[product.category] ?? product.category
    : "";

  const fallbackImg =
    "https://dummyimage.com/400x400/cccccc/000000&text=CampusTrade";

  // ✅ C1：列表卡片优先用缩略图（thumb），没有就退回 image
  const imgSrc = product.thumb || product.image || fallbackImg;

  return (
    <div className="product-card">
      <img
        src={imgSrc}
        alt={product.name}
        loading="lazy"
        onError={(e) => {
          // 避免死循环：如果已经是 fallback 还报错，就不要继续改 src
          if (e.currentTarget.src !== fallbackImg) {
            e.currentTarget.src = fallbackImg;
          }
        }}
      />

      <div className="product-card-body">
        <h3 className="product-card-title">{product.name}</h3>

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