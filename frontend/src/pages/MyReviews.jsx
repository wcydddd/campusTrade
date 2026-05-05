import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch, getStoredUser } from "../api";
import { useAuth } from "../context/AuthContext";
import UserCenterSidebar from "../components/UserCenterSidebar";

function ReviewStars({ rating, size = 14 }) {
  const r = Math.round(Number(rating) || 0);
  return (
    <span className="text-amber-500 shrink-0" style={{ fontSize: size }} aria-hidden>
      {"★".repeat(r)}{"☆".repeat(Math.max(0, 5 - r))}
    </span>
  );
}

function GivenReviewCard({ r, navigate }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
      <div className="flex justify-between gap-3 items-baseline flex-wrap">
        <div className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
          To: {r.reviewee_username || "User"}
          <ReviewStars rating={r.rating} />
        </div>
        <div className="text-xs text-gray-400 shrink-0">
          {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
        </div>
      </div>
      {r.comment ? (
        <p className="mt-2 mb-0 text-sm text-gray-700 leading-relaxed">{r.comment}</p>
      ) : (
        <p className="mt-2 mb-0 text-sm text-gray-400 italic">No comment</p>
      )}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => navigate(`/my-orders?focus=${encodeURIComponent(r.order_id || "")}`)}
          className="p-0 border-none bg-transparent text-indigo-600 cursor-pointer underline text-xs hover:text-indigo-800 transition-colors"
          title="Go to this order"
        >
          Order: {String(r.order_id || "").slice(-8)}
        </button>
      </div>
    </div>
  );
}

function ReceivedReviewCard({ r, navigate, roleLabel }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
      <div className="flex justify-between gap-3 items-baseline flex-wrap">
        <div className="font-extrabold text-gray-900 text-sm flex items-center gap-2 flex-wrap">
          From: {r.reviewer_username || "User"}
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {roleLabel}
          </span>
          <ReviewStars rating={r.rating} />
        </div>
        <div className="text-xs text-gray-400 shrink-0">
          {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
        </div>
      </div>
      {r.comment ? (
        <p className="mt-2 mb-0 text-sm text-gray-700 leading-relaxed">{r.comment}</p>
      ) : (
        <p className="mt-2 mb-0 text-sm text-gray-400 italic">No comment</p>
      )}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => navigate(`/my-orders?focus=${encodeURIComponent(r.order_id || "")}`)}
          className="p-0 border-none bg-transparent text-indigo-600 cursor-pointer underline text-xs hover:text-indigo-800 transition-colors"
          title="Go to this order"
        >
          Order: {String(r.order_id || "").slice(-8)}
        </button>
      </div>
    </div>
  );
}

const tabBtn =
  "relative pb-3 text-sm font-bold bg-transparent border-none cursor-pointer px-0 transition-colors";
const tabActive = `${tabBtn} text-gray-900 after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-0 after:w-8 after:h-[3px] after:rounded-full after:bg-amber-400`;
const tabIdle = `${tabBtn} text-gray-400 hover:text-gray-600`;

export default function MyReviews() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("given");

  const [givenItems, setGivenItems] = useState([]);
  const [receivedSeller, setReceivedSeller] = useState([]);
  const [receivedBuyer, setReceivedBuyer] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const userId = user?.id ?? getStoredUser()?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const [givenRes, recvRes] = await Promise.all([
        authFetch(`${API_BASE}/reviews/me?limit=200`),
        authFetch(`${API_BASE}/reviews/user/${userId}?limit=100`),
      ]);

      const givenData = await givenRes.json().catch(() => ({}));
      if (!givenRes.ok) {
        throw new Error(givenData.detail || givenData.message || "Failed to load reviews you wrote");
      }
      setGivenItems(Array.isArray(givenData.items) ? givenData.items : []);

      const recvData = await recvRes.json().catch(() => ({}));
      if (!recvRes.ok) {
        throw new Error(recvData.detail || recvData.message || "Failed to load reviews you received");
      }
      setReceivedSeller(Array.isArray(recvData.as_seller?.items) ? recvData.as_seller.items : []);
      setReceivedBuyer(Array.isArray(recvData.as_buyer?.items) ? recvData.as_buyer.items : []);
    } catch (e) {
      setError(e.message || "Failed to load reviews");
      setGivenItems([]);
      setReceivedSeller([]);
      setReceivedBuyer([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, userId, load]);

  const receivedTotal = receivedSeller.length + receivedBuyer.length;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto flex gap-6 pt-6 px-4 pb-10">
        <UserCenterSidebar />

        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="relative bg-gradient-to-b from-gray-100 to-white px-6 pt-1 pb-5">
            <div className="h-1 w-full bg-gray-200 rounded-b-full absolute top-0 left-0 right-0" />

            <h1 className="text-lg font-extrabold text-gray-900 tracking-tight mt-5 mb-4">Reviews</h1>

            <div className="flex items-start gap-5">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url.startsWith("http") ? user.avatar_url : `${API_BASE}${user.avatar_url}`}
                  alt={user.username || "avatar"}
                  className="w-20 h-20 rounded-full object-cover bg-gray-200 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <svg className="w-9 h-9 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
                  </svg>
                </div>
              )}

              <div className="flex-1 min-w-0 pt-1">
                <p className="text-2xl font-bold text-gray-900 m-0 truncate">{user?.username || "User"}</p>
                <p className="text-sm text-gray-400 mt-1 mb-0">
                  {givenItems.length} review{givenItems.length !== 1 ? "s" : ""} given
                  {" · "}
                  {receivedTotal} review{receivedTotal !== 1 ? "s" : ""} received
                </p>
              </div>

              <Link
                to="/home"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors no-underline shrink-0 mt-auto"
              >
                &larr; Back to Home
              </Link>
            </div>
          </div>

          <div className="px-6 flex items-end gap-6 border-b border-gray-100">
            <button type="button" className={tab === "given" ? tabActive : tabIdle} onClick={() => setTab("given")}>
              Reviews I gave
            </button>
            <button type="button" className={tab === "received" ? tabActive : tabIdle} onClick={() => setTab("received")}>
              Reviews I received
            </button>
          </div>

          <div className="p-6">
            {(authLoading || (loading && userId)) && <p className="text-gray-400">Loading...</p>}
            {error && <p className="text-red-700">{error}</p>}

            {!authLoading && !userId && !loading && (
              <p className="text-gray-400">Sign in to see your reviews.</p>
            )}

            {!loading && !error && userId && tab === "given" && givenItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24">
                <svg
                  className="w-16 h-16 text-gray-200 mb-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
                <p className="text-sm text-gray-400 m-0">You haven&apos;t written any reviews yet.</p>
              </div>
            )}

            {!loading && !error && userId && tab === "given" && givenItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {givenItems.map((r) => (
                  <GivenReviewCard key={r.id} r={r} navigate={navigate} />
                ))}
              </div>
            )}

            {!loading && !error && userId && tab === "received" && receivedTotal === 0 && (
              <div className="flex flex-col items-center justify-center py-24">
                <svg
                  className="w-16 h-16 text-gray-200 mb-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <p className="text-sm text-gray-400 m-0">No one has reviewed you yet.</p>
              </div>
            )}

            {!loading && !error && userId && tab === "received" && receivedTotal > 0 && (
              <div className="flex flex-col gap-8">
                {receivedSeller.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider m-0 mb-3">
                      As seller ({receivedSeller.length})
                    </h2>
                    <div className="flex flex-col gap-3">
                      {receivedSeller.map((r) => (
                        <ReceivedReviewCard key={r.id} r={r} navigate={navigate} roleLabel="Seller" />
                      ))}
                    </div>
                  </div>
                )}
                {receivedBuyer.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider m-0 mb-3">
                      As buyer ({receivedBuyer.length})
                    </h2>
                    <div className="flex flex-col gap-3">
                      {receivedBuyer.map((r) => (
                        <ReceivedReviewCard key={r.id} r={r} navigate={navigate} roleLabel="Buyer" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
