import React, { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser, useClerk } from '@clerk/clerk-react';
import { Music, History, Shield, AlertTriangle } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  onHistoryToggle?: () => void;
  showHistoryButton?: boolean;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, onHistoryToggle, showHistoryButton = false }) => {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string>('');

  useEffect(() => {
    if (isLoaded && user) {
      // Check authorization
      const checkAuthorization = () => {
        try {
          // Check for org:admin role
          const hasAdminRole = user.organizationMemberships?.some(
            membership => membership.role === 'org:admin'
          ) || user.publicMetadata?.role === 'org:admin';

          if (hasAdminRole) {
            setIsAuthorized(true);
            return;
          }

          // Check if email or username contains 'staff'
          const email = user.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
          const username = user.username?.toLowerCase() || '';
          
          const hasStaffInEmail = email.includes('staff');
          const hasStaffInUsername = username.includes('staff');

          if (hasStaffInEmail || hasStaffInUsername) {
            setIsAuthorized(true);
            return;
          }

          // If neither condition is met, user is not authorized
          setIsAuthorized(false);
          setAuthError('Access denied: You must be an admin or staff member to use this application.');

          // Force logout after a short delay to show the error message
          setTimeout(() => {
            signOut();
          }, 3000);

        } catch (error) {
          console.error('Authorization check error:', error);
          setIsAuthorized(false);
          setAuthError('Error checking authorization. Please try again.');
          
          setTimeout(() => {
            signOut();
          }, 3000);
        }
      };

      checkAuthorization();
    } else if (isLoaded && !user) {
      // User is not signed in
      setIsAuthorized(null);
    }
  }, [isLoaded, user, signOut]);

  // Loading state while checking authorization
  if (isLoaded && user && isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-musica-cream via-amber-50 to-musica-cream flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-2xl p-8 border border-musica-burgundy/10 shadow-xl max-w-md w-full">
          <div className="w-16 h-16 bg-musica-gold rounded-xl flex items-center justify-center shadow-lg mx-auto mb-6 animate-pulse">
            <Shield className="w-8 h-8 text-musica-burgundy" />
          </div>
          <h2 className="text-2xl font-bold text-musica-burgundy mb-4">
            Checking Authorization...
          </h2>
          <p className="text-musica-burgundy/70">
            Please wait while we verify your access permissions.
          </p>
        </div>
      </div>
    );
  }

  // Authorization failed state
  if (isLoaded && user && isAuthorized === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-red-25 to-red-50 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-2xl p-8 border border-red-200 shadow-xl max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center shadow-lg mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-red-700 mb-4">
            Access Denied
          </h2>
          <p className="text-red-600 mb-6">
            {authError}
          </p>
          <p className="text-red-500 text-sm">
            You will be signed out automatically in a few seconds...
          </p>
        </div>
      </div>
    );
  }

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
        {/* Only show children if user is authorized */}
        {isAuthorized && children}
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