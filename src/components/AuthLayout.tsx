import React from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">QR Scanner</h1>
            </div>
            <div className="flex items-center space-x-4">
              <SignedIn>
                <UserButton />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Sign In
                  </button>
                </SignInButton>
              </SignedOut>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <SignedIn>
          {children}
        </SignedIn>
        <SignedOut>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
                Welcome to QR Scanner
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Please sign in to access the QR scanner functionality.
              </p>
              <SignInButton mode="modal">
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg">
                  Sign In to Continue
                </button>
              </SignInButton>
            </div>
          </div>
        </SignedOut>
      </main>
    </div>
  );
};

export default AuthLayout; 