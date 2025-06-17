import React, { useState } from 'react';
import QRScanner from './components/QRScanner';
import AuthLayout from './components/AuthLayout';

function App() {
  const [showHistory, setShowHistory] = useState(false);

  const handleHistoryToggle = () => {
    setShowHistory(!showHistory);
  };

  return (
    <AuthLayout 
      onHistoryToggle={handleHistoryToggle}
      showHistoryButton={true}
    >
      <QRScanner showHistoryProp={showHistory} />
    </AuthLayout>
  );
}

export default App;