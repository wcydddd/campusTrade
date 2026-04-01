import { NavLink, useLocation } from "react-router-dom";

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Icon({ d }) {
  return (
    <svg {...ICON_PROPS} className="shrink-0">
      <path d={d} />
    </svg>
  );
}

const MENU = [
  {
    group: "My Transactions",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
    items: [
      {
        label: "Manage My Products",
        to: "/my-products",
        icon: "M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 0L4 7m8 4v10m0-10L4 7v10l8 4",
      },
      {
        label: "My Orders",
        to: "/my-orders",
        icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 14l2 2 4-4",
      },
      {
        label: "Reviews",
        to: "/reviews",
        icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 0 0 .95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 0 0-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 0 0-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 0 0-.363-1.118L2.049 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 0 0 .951-.69l1.519-4.674z",
      },
    ],
  },
  {
    group: "My Interests",
    icon: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
    items: [
      {
        label: "My Favorites",
        to: "/my-favorites",
        icon: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
      },
      {
        label: "Recently Viewed",
        to: "/recent-viewed",
        icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
      },
    ],
  },
  {
    group: "Account Settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    items: [
      {
        label: "My Profile",
        to: "/me",
        icon: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z",
      },
    ],
  },
];

function linkClass({ isActive }) {
  const base =
    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] leading-5 no-underline transition-colors";
  return isActive
    ? `${base} bg-gray-100 text-gray-900 font-bold`
    : `${base} text-gray-600 hover:bg-gray-50 font-medium`;
}

export default function UserCenterSidebar() {
  const location = useLocation();

  return (
    <aside className="w-56 shrink-0 self-start sticky top-6">
      <nav className="bg-white rounded-2xl py-5 px-3">
        {MENU.map((section, idx) => (
          <div key={section.group} className={idx > 0 ? "mt-5" : ""}>
            <div className="flex items-center gap-2 px-4 mb-1.5">
              <Icon d={section.icon} />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {section.group}
              </span>
            </div>

            <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={linkClass}>
                    <Icon d={item.icon} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
