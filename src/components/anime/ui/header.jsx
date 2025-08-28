// src/components/anime/ui/header.jsx
import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Bookmark,
  Home,
  Cat,
  MoreHorizontal,
  LogIn,
  UserPlus,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient.js';
import { setAuthUser } from '../../../utils.jsx';
import { useAnimeWatchlistStore } from '../../../store/animeWatchlistStore';

// Core nav items (first items show directly; rest go under "More" on mobile)
const navItems = [
  { to: '/', label: 'Home', icon: Home, type: 'nav' },
  { to: '/anime', label: 'Anime', icon: Cat, type: 'nav' },
];

// Header icons (merged into "More" on mobile)
// 👉 Search now goes to /anime/search
const headerIcons = [
  { to: '/anime/search', label: 'Search', icon: Search, type: 'icon' },
  { to: '/anime/watchlist', label: 'Watchlist', icon: Bookmark, type: 'icon' }, // Anime-only watchlist
];

const InstallIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

export default function AnimeHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileHeaderOpacity, setMobileHeaderOpacity] = useState(1);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const lastScrollY = useRef(0);
  const moreMenuRef = useRef(null);
  const profileMenuRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  const animeCount = useAnimeWatchlistStore((s) => Object.keys(s.items).length);

  useEffect(() => {
    let unsub;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data?.session?.user ?? null;
      setUser(u);
      setAuthUser(u);
      unsub = supabase.auth.onAuthStateChange((_e, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        setAuthUser(nextUser);
      }).data.subscription;
    })();
    return () => unsub?.unsubscribe?.();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 10);
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setMobileHeaderOpacity(0);
      } else {
        setMobileHeaderOpacity(1);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor || '');
  const isPWA = window.navigator.standalone;
  const showIOSInstall = isIOS && !isPWA;

  const combinedNavItems = [
    ...navItems,
    ...headerIcons,
    ...(showIOSInstall
      ? [{ to: '/ios', label: 'Install', icon: InstallIcon, type: 'install' }]
      : []),
  ];

  const visibleItems = combinedNavItems.slice(0, 3);
  const moreItems = combinedNavItems.slice(3);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) setShowMoreMenu(false);
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setShowProfileMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  const onLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAuthUser(null);
    setShowProfileMenu(false);
  };

  const userBadge = (() => {
    if (!user) return null;
    const email = user.email || '';
    const letter = email?.[0]?.toUpperCase?.() || 'U';
    return (
      <button
        onClick={() => setShowProfileMenu((v) => !v)}
        className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-sm font-semibold"
        aria-label="Account menu"
      >
        {letter}
      </button>
    );
  })();

  return (
    <>
      {/* Desktop Header */}
      <header
        className={`fixed top-0 left-0 mx-16 bg-transparent transition-all duration-200 rounded-b-2xl z-50 py-3 px-4 pl-8 text-white items-center text-md flex-row justify-between hidden md:flex ${
          isScrolled ? 'bg-zinc-800/60 backdrop-blur-md' : ''
        }`}
        style={{ width: 'calc(100% - 8rem)' }}
      >
        <div className="flex items-center flex-row gap-2">
          <NavLink
            to="/"
            className="text-2xl mr-6 hover:text-blue-400 transition-colors font-instrument"
            aria-label="NepoFlix Home"
          >
            NepoFlix
          </NavLink>

          {navItems.map(({ to, label }, idx) => (
            <NavLink
              key={idx}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg transition-all duration-200 hover:bg-white hover:text-zinc-900 hover:shadow-[0_0_30px_#e7eaee50] ${
                  isActive ? 'bg-white/20 text-white' : 'text-gray-200'
                }`
              }
              aria-current={location.pathname === to ? 'page' : undefined}
            >
              {label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center flex-row gap-2">
          {headerIcons.map(({ to, label, icon: Icon }, idx) => (
            <NavLink
              key={idx}
              to={to}
              className={({ isActive }) =>
                `relative p-2 rounded-full transition-all duration-200 hover:bg-white hover:text-zinc-900 hover:shadow-[0_0_30px_#e7eaee50] ${
                  isActive ? 'bg-white/20 text-white' : 'text-gray-200'
                }`
              }
              aria-label={label}
              aria-current={location.pathname === to ? 'page' : undefined}
            >
              <Icon className="w-5 h-5" />
              {to === '/anime/watchlist' && animeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] leading-[18px] text-center">
                  {animeCount > 99 ? '99+' : animeCount}
                </span>
              )}
            </NavLink>
          ))}

          {!user ? (
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => navigate('/login', { state: { from: location.pathname } })}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" /> <span>Sign in</span>
              </button>
              <button
                onClick={() => navigate('/signup', { state: { from: location.pathname } })}
                className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> <span>Create account</span>
              </button>
            </div>
          ) : (
            <div className="relative ml-2" ref={profileMenuRef}>
              {userBadge}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 bg-[#232323ab] backdrop-blur-lg rounded-lg shadow-lg py-2 px-2 min-w-[200px]">
                  <div className="px-3 py-2 text-sm text-zinc-300 flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <button
                    onClick={onLogout}
                    className="w-full text-left px-3 py-2 rounded-md text-zinc-300 hover:bg-white/10 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Mobile Bottom Bar */}
      <div
        className="fixed bottom-[-1px] left-0 w-full flex justify-around items-center py-4 pb-8 z-50 md:hidden bg-[#232323ab] backdrop-blur-lg transition-opacity duration-300"
        style={{ opacity: mobileHeaderOpacity }}
      >
        {visibleItems.map(({ to, label, icon: Icon }, idx) => (
          <NavLink
            key={idx}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center transition-colors ${
                isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
              }`
            }
            aria-label={label}
            aria-current={location.pathname === to ? 'page' : undefined}
          >
            {Icon && <Icon className="w-6 h-6" />}
            <span className="text-xs mt-1">{label}</span>
          </NavLink>
        ))}

        <div className="relative">
          <button
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className="flex flex-col items-center text-zinc-400 hover:text-white transition-colors"
            aria-label="More"
          >
            <MoreHorizontal className="w-6 h-6" />
            <span className="text-xs mt-1">More</span>
          </button>
          {showMoreMenu && (
            <div
              ref={moreMenuRef}
              className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-[#232323ab] backdrop-blur-lg rounded-lg shadow-lg py-2 px-4 z-50 min-w-[220px]"
            >
              {moreItems.map(({ to, label, icon: Icon }, idx) => (
                <NavLink
                  key={idx}
                  to={to}
                  end={to === '/'}
                  onClick={() => setShowMoreMenu(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 py-2 px-4 transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                    }`
                  }
                  aria-label={label}
                  aria-current={location.pathname === to ? 'page' : undefined}
                >
                  {Icon && <Icon className="w-5 h-5" />}
                  <span className="flex items-center gap-2">
                    {label}
                    {to === '/anime/watchlist' && animeCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-pink-500 text-white text-[10px] leading-[16px]">
                        {animeCount > 99 ? '99+' : animeCount}
                      </span>
                    )}
                  </span>
                </NavLink>
              ))}

              {!user ? (
                <>
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/login', { state: { from: location.pathname } });
                    }}
                    className="w-full text-left flex items-center gap-2 py-2 px-4 text-zinc-400 hover:text-white"
                  >
                    <LogIn className="w-5 h-5" /> <span>Sign in</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/signup', { state: { from: location.pathname } });
                    }}
                    className="w-full text-left flex items-center gap-2 py-2 px-4 text-zinc-400 hover:text-white"
                  >
                    <UserPlus className="w-5 h-5" /> <span>Create account</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    setShowMoreMenu(false);
                    await onLogout();
                  }}
                  className="w-full text-left flex items-center gap-2 py-2 px-4 text-zinc-400 hover:text-white"
                >
                  <LogOut className="w-5 h-5" /> <span>Sign out</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
