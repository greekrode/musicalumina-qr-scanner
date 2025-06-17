import React from 'react';
import QRScanner from './components/QRScanner';
import AuthLayout from './components/AuthLayout';

function App() {
  return (
    <AuthLayout>
      <QRScanner />
    </AuthLayout>
  );
}

export default App;