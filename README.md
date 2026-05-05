# 🎓 CampusTrade

**AI-Powered Campus Marketplace for Students**

A secure, intelligent peer-to-peer trading platform exclusively for university students, featuring AI-assisted product listing and smart matching.

---

## 📖 Overview

CampusTrade revolutionizes campus second-hand trading by combining:
- **AI-powered product recognition** - Just snap a photo, AI handles the rest
- **University email verification** - Building trust within campus community  
- **Smart price suggestions** - AI recommends optimal pricing based on condition
- **Instant messaging** - Connect with buyers/sellers directly

Say goodbye to tedious listing descriptions. Say hello to effortless campus trading.

---

## ✨ Key Features

### 🤖 AI Smart Listing
- **Photo Recognition**: Upload a product image, AI identifies what it is
- **Auto Description**: AI generates compelling product descriptions
- **Price Recommendation**: AI suggests fair market prices
- **Category Detection**: Automatic categorization (textbooks, electronics, furniture, etc.)

### 🛍️ Core Marketplace
- 🔐 **Secure Authentication**: University email verification only
- 💰 **Flexible Trading**: Sell for cash, exchange items, or donate
- 🔍 **Advanced Search**: Filter by category, price, condition, and campus location
- 💬 **Real-time Chat**: Built-in messaging for transaction coordination
- 📱 **Mobile Responsive**: Seamless experience on any device

### 🎯 Special Modules
- **Lost & Found**: AI-powered matching for lost items
- **Textbook Exchange**: Dedicated section for course materials
- **Sustainability Tracker**: See your environmental impact

---

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | Fast, modern UI with hot reload |
| **Backend** | FastAPI (Python 3.12) | High-performance async API |
| **Database** | MongoDB | Flexible NoSQL for diverse product data |
| **AI Engine** | OpenAI GPT-4 Vision | Product recognition & description generation |
| **Authentication** | JWT + bcrypt | Secure token-based auth with password hashing |
| **Real-time** | WebSocket | Instant messaging between users |
| **Image Storage** | Cloudinary / AWS S3 | Scalable image hosting |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB 6.0+
- OpenAI API Key

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/campusTrade.git
cd campusTrade
```

### 2. Backend Setup
```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r ../requirements.txt

# Create .env file
cat > .env << EOF
MONGODB_URI=mongodb://localhost:27017/campustrade
JWT_SECRET=your-super-secret-key-change-this
OPENAI_API_KEY=sk-your-openai-api-key
EOF

# Run server
uvicorn main:app --reload
```

**Backend will run at**: http://localhost:8000  
**API Docs**: http://localhost:8000/docs

### 3. Frontend Setup (Coming Soon)
```bash
cd frontend
npm install
npm run dev
```

**Frontend will run at**: http://localhost:5173

---

## 📚 Project Structure
```
campusTrade/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Configuration management
│   ├── models/                 # Pydantic data models
│   │   ├── user.py
│   │   ├── product.py
│   │   └── message.py
│   ├── routes/                 # API endpoints
│   │   ├── auth.py            # Login/Register
│   │   ├── products.py        # Product CRUD
│   │   ├── ai.py              # AI recognition
│   │   └── messages.py        # Chat system
│   ├── utils/                  # Helper functions
│   │   ├── ai_helper.py       # OpenAI integration
│   │   ├── security.py        # JWT & password hashing
│   │   └── database.py        # MongoDB connection
│   └── tests/                  # Unit tests
├── frontend/                   # React application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   └── services/          # API calls
│   └── public/
├── docs/                       # Project documentation
│   ├── api-design.md
│   ├── database-schema.md
│   └── ai-prompts.md
├── requirements.txt            # Python dependencies
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🤖 AI Integration Example

### How AI Smart Listing Works

**User Action**: Upload a photo of a MacBook  
**AI Processing**:
```json
{
  "item_name": "MacBook Pro 13-inch 2020",
  "category": "Electronics",
  "condition": "Like New (9/10)",
  "description": "Powerful laptop perfect for coding and design work. Includes original charger, minimal wear on keyboard.",
  "suggested_price": "£450-500"
}
```

**Prompt Used**:
```
Analyze this product image and return JSON:
- item_name: Specific product model
- category: Electronics/Textbooks/Furniture/Clothing/Other
- condition: Rate 1-10 with description
- description: Compelling 50-word sales pitch
- suggested_price: Fair market range in GBP
```

---

## 🧪 Testing
```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=backend --cov-report=html

# Run specific test file
pytest tests/test_auth.py
```

---

## 🗺️ Development Roadmap

### Phase 1: MVP (Weeks 1-4) ✅
- [x] Project setup & repository structure
- [ ] User authentication with email verification
- [ ] Basic product CRUD operations
- [ ] Simple search functionality

### Phase 2: AI Integration (Weeks 5-7)
- [ ] OpenAI Vision API integration
- [ ] AI-powered product description generation
- [ ] Smart price recommendation system
- [ ] Auto-categorization

### Phase 3: Enhanced Features (Weeks 8-9)
- [ ] Real-time chat system
- [ ] Image upload & optimization
- [ ] Lost & Found module
- [ ] User reputation system

### Phase 4: Polish & Deploy (Week 10)
- [ ] Unit & integration testing (>70% coverage)
- [ ] User acceptance testing with 10+ students
- [ ] Performance optimization
- [ ] Production deployment

---

## 👥 Team & Contributors

### Core Team (7 Members)
- **Frontend Team** (3): React UI/UX development
- **Backend Team** (2): FastAPI & database design  
- **AI Engineer** (1): OpenAI integration & prompt engineering
- **DevOps/QA** (1): Testing, deployment, documentation

### Project Lead
- **Wcy** - Full Stack Developer & Project Manager

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- OpenAI for GPT-4 Vision API
- FastAPI framework community
- MongoDB University Program
- [Your University Name] for supporting student innovation

---

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/campusTrade/issues)
- **Email**: wcy@university.edu
- **Documentation**: [Full Docs](./docs/)

---

<p align="center">
  <strong>Built with ❤️ by students, for students</strong><br>
  Making campus life more sustainable, one trade at a time 🌱
</p>