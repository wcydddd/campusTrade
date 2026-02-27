// src/components/ProductCard.jsx
import "./ProductCard.css";
import { useNavigate } from "react-router-dom";

function ProductCard({ product }) {
  const navigate = useNavigate();

  // 兜底图（避免任何图片域名解析失败）
  const fallbackImg = "https://dummyimage.com/400x400/cccccc/000000&text=CampusTrade";

  return (
    <div className="product-card">
      <img
        src={product.image}
        alt={product.name}
        onError={(e) => {
          e.currentTarget.src = fallbackImg;
        }}
      />

      <div className="product-card-body">
        <h3 className="product-card-title">{product.name}</h3>

        <div className="product-card-meta">
          <p className="price">£{product.price}</p>
          <span className="badge">{product.condition}</span>
        </div>

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