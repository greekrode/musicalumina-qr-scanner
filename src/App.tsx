import AuthLayout from "./components/AuthLayout";
import QRScanner from "./components/QRScanner";

export default function App() {
  return (
    <AuthLayout>
      <QRScanner />
    </AuthLayout>
  );
}
