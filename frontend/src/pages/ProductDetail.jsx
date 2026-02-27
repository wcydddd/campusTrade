import { useParams, useNavigate } from "react-router-dom";

const mockProducts = [
  {
    id: 1,
    name: "MacBook Pro 2020",
    price: 480,
    condition: "Like New",
    image: "https://placehold.co/600x400",
  },
  {
    id: 2,
    name: "Calculus Textbook",
    price: 25,
    condition: "Used",
    image: "https://placehold.co/600x400",
  },
  {
    id: 3,
    name: "Desk Lamp",
    price: 10,
    condition: "Good",
    image: "https://placehold.co/600x400",
  },
];

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const product = mockProducts.find((p) => String(p.id) === String(id));

  const fallbackImg =
    "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade";

  if (!product) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Product not found</h2>
        <button onClick={() => navigate("/")}>Back to Home</button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: 24,
        display: "flex",
        gap: 40,
        flexWrap: "wrap",
      }}
    >
      {/* 图片区域 */}
      <div style={{ flex: 1, minWidth: 300 }}>
        <img
          src={product.image}
          alt={product.name}
          onError={(e) => {
            e.currentTarget.src = fallbackImg;
          }}
          style={{
            width: "100%",
            borderRadius: 12,
            objectFit: "cover",
          }}
        />
      </div>

      {/* 信息区域 */}
      <div style={{ flex: 1, minWidth: 280 }}>
        <button onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
          ← Back
        </button>

        <h1 style={{ marginBottom: 10 }}>{product.name}</h1>

        <p style={{ fontSize: 22, fontWeight: "bold", marginBottom: 12 }}>
          £{product.price}
        </p>

        <p style={{ marginBottom: 20 }}>
          <strong>Condition:</strong> {product.condition}
        </p>

        <button
          onClick={() => navigate(`/chat/${product.id}`)}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Chat with Seller
        </button>
      </div>
    </div>
  );
}