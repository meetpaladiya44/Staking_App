"use client";
import React, { useState } from 'react';

// Custom icons (you can replace these with your preferred icon library)
const HomeIcon = ({ className = "", filled = false }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9,22 9,12 15,12 15,22" />
  </svg>
);

const WalletIcon = ({ className = "", filled = false }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <rect x="1" y="3" width="15" height="13" />
    <path d="m16 8 4-4-4-4" />
    <path d="M21 12H9" />
  </svg>
);

const UserIcon = ({ className = "", filled = false }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

interface TabItemProps {
  value: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

const TabItem: React.FC<TabItemProps> = ({
  value,
  icon,
  label,
  isActive,
  onClick,
  className = ""
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center px-3 py-2 min-w-0 flex-1
        transition-all duration-200 ease-in-out
        hover:bg-gray-800/50 active:scale-95
        ${isActive
          ? 'text-white bg-sky-800/30 border-t-2 border-sky-400'
          : 'text-gray-400 hover:text-gray-200'
        }
        ${className}
      `}
      aria-label={label}
      role="tab"
      aria-selected={isActive}
    >
      <div className={`mb-1 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
        {React.cloneElement(icon as React.ReactElement<{ className?: string; filled?: boolean }>, {
          className: "w-5 h-5",
          filled: isActive
        })}
      </div>
      <span className={`text-xs font-medium truncate transition-all duration-200 ${isActive ? 'text-white font-semibold' : 'text-gray-500'
        }`}>
        {label}
      </span>
      {isActive && (
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-sky-400 rounded-full" />
      )}
    </button>
  );
};

interface NavigationProps {
  onNavigate?: (value: string) => void;
  className?: string;
}

export const Navigation: React.FC<NavigationProps> = ({
  onNavigate,
  className = ""
}) => {
  const [activeTab, setActiveTab] = useState('home');

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    onNavigate?.(value);
  };

  const tabs = [
    {
      value: 'home',
      icon: <HomeIcon />,
      label: 'Home'
    },
    {
      value: 'wallet',
      icon: <WalletIcon />,
      label: 'Wallet'
    },
    {
      value: 'profile',
      icon: <UserIcon />,
      label: 'Profile'
    }
  ];

  return (
    <nav
      className={`
        fixed bottom-0 left-0 right-0 z-50
        bg-gray-900/95 backdrop-blur-lg
        border-t border-gray-800
        px-2 pb-safe-area-inset-bottom
        ${className}
      `}
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around max-w-md mx-auto relative">
        {tabs.map((tab) => (
          <TabItem
            key={tab.value}
            value={tab.value}
            icon={tab.icon}
            label={tab.label}
            isActive={activeTab === tab.value}
            onClick={() => handleTabChange(tab.value)}
            className="relative"
          />
        ))}
      </div>
    </nav>
  );
};

// Demo component to show the navigation in action
const MiniAppDemo: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('home');

  const renderContent = () => {
    switch (currentPage) {
      case 'home':
        return (
          <div className="text-center py-20">
            <h1 className="text-3xl font-bold text-white mb-4">Home</h1>
            <p className="text-gray-400">Welcome to your World Mini App</p>
          </div>
        );
      case 'wallet':
        return (
          <div className="text-center py-20">
            <h1 className="text-3xl font-bold text-white mb-4">Wallet</h1>
            <div className="bg-sky-800/20 rounded-lg p-6 mx-4">
              <p className="text-gray-300">Your wallet balance</p>
              <p className="text-2xl font-bold text-white mt-2">1,234 WLD</p>
            </div>
          </div>
        );
      case 'profile':
        return (
          <div className="text-center py-20">
            <h1 className="text-3xl font-bold text-white mb-4">Profile</h1>
            <div className="bg-gray-800/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <UserIcon className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-400">Your World ID profile</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Main content area */}
      <main className="pb-20 px-4">
        {renderContent()}
      </main>

      {/* Custom Navigation */}
      <Navigation onNavigate={setCurrentPage} />
    </div>
  );
};

export default MiniAppDemo;