import React from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import { Music, History } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  onHistoryToggle?: () => void;
  showHistoryButton?: boolean;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, onHistoryToggle, showHistoryButton = false }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-musica-cream via-amber-50 to-musica-cream">
      {/* Header - matching QRScanner design */}
      <div className="bg-musica-burgundy/95 backdrop-blur-lg border-b border-musica-burgundy/20 px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-musica-gold rounded-xl flex items-center justify-center shadow-lg">
              <Music className="w-6 h-6 text-musica-burgundy" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-musica-cream">Musica Lumina</h1>
              <p className="text-musica-cream/80 text-sm">QR Scanner</p>
            </div>
          </div>
          <SignedIn>
            <div className="flex items-center space-x-3">
              {showHistoryButton && onHistoryToggle && (
                <button
                  onClick={onHistoryToggle}
                  className="p-2 text-musica-cream/80 hover:text-musica-cream hover:bg-musica-burgundy/30 rounded-lg transition-colors"
                >
                  <History className="w-5 h-5" />
                </button>
              )}
              <div className="bg-musica-gold/20 backdrop-blur-sm rounded-lg p-1">
                <UserButton 
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8",
                      userButtonPopoverCard: "bg-white border border-musica-burgundy/20",
                    }
                  }}
                />
              </div>
            </div>
          </SignedIn>
        </div>
      </div>

      {/* Main content */}
      <SignedIn>
        {children}
      </SignedIn>
      
      <SignedOut>
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="text-center bg-white/80 backdrop-blur-lg rounded-2xl p-8 border border-musica-burgundy/10 shadow-xl max-w-md w-full">
            <div className="w-16 h-16 bg-musica-gold rounded-xl flex items-center justify-center shadow-lg mx-auto mb-6">
              <Music className="w-8 h-8 text-musica-burgundy" />
            </div>
            <h2 className="text-3xl font-bold text-musica-burgundy mb-4">
              Welcome to Musica Lumina
            </h2>
            <p className="text-musica-burgundy/70 mb-8">
              Please sign in to access the QR scanner functionality and verify participants.
            </p>
            <SignInButton mode="modal">
              <button className="w-full bg-musica-burgundy hover:bg-musica-burgundy/90 text-musica-cream font-bold py-3 px-6 rounded-lg text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105">
                Sign In to Continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </div>
  );
};

export default AuthLayout; 