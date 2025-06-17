import { Camera, Copy, X } from "lucide-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import { DecodedJWT, decodeJWT, isJWT } from "../utils/jwtDecoder";
import JWTDecoder from "./JWTDecoder";

interface ScanResult {
  id: string;
  text: string;
  timestamp: Date;
  isJWT: boolean;
  decodedJWT?: DecodedJWT;
}

interface QRScannerProps {
  showHistoryProp?: boolean;
}

export default function QRScanner({ showHistoryProp = false }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [qrScanner, setQrScanner] = useState<QrScanner | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [decodedJWT, setDecodedJWT] = useState<DecodedJWT | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(showHistoryProp);
  const [hasCamera, setHasCamera] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Update showHistory when prop changes
  useEffect(() => {
    setShowHistory(showHistoryProp);
  }, [showHistoryProp]);

  useEffect(() => {
    if (videoRef.current) {
      const scanner = new QrScanner(
        videoRef.current,
        async (result) => {
          const scannedText = result.data;
          const isJWTToken = isJWT(scannedText);
          let decodedJWTData: DecodedJWT | undefined;

          if (isJWTToken) {
            try {
              decodedJWTData = await decodeJWT(scannedText);
              setDecodedJWT(decodedJWTData);
            } catch (error) {
              console.error("JWT decoding error:", error);
              setDecodedJWT(null);
            }
          } else {
            setDecodedJWT(null);
          }

          const newScan: ScanResult = {
            id: Date.now().toString(),
            text: scannedText,
            timestamp: new Date(),
            isJWT: isJWTToken,
            decodedJWT: decodedJWTData,
          };

          setScanResult(scannedText);
          setScanHistory((prev) => [newScan, ...prev.slice(0, 19)]); // Keep last 20 scans

          // Vibrate if supported
          if (navigator.vibrate) {
            navigator.vibrate(200);
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: "environment",
        }
      );

      setQrScanner(scanner);

      return () => {
        scanner.destroy();
      };
    }
  }, []);

  const startScanning = async () => {
    if (!qrScanner) return;

    try {
      setError(null);
      await qrScanner.start();
      setIsScanning(true);
    } catch (err) {
      console.error("Camera error:", err);
      setError(
        "Unable to access camera. Please ensure camera permissions are granted."
      );
      setHasCamera(false);
    }
  };

  const stopScanning = () => {
    if (qrScanner) {
      qrScanner.stop();
      setIsScanning(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const clearHistory = () => {
    setScanHistory([]);
  };

  const isUrl = (text: string) => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Copy Feedback */}
      {copyFeedback && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-musica-gold text-musica-burgundy px-4 py-2 rounded-lg shadow-lg z-50 font-medium">
          {copyFeedback}
        </div>
      )}

      {/* Camera Section */}
      <div className="relative">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 border border-musica-burgundy/10 shadow-xl">
          <div className="relative aspect-square max-w-sm mx-auto">
            <video
              ref={videoRef}
              className="w-full h-full object-cover rounded-xl bg-musica-burgundy/10 shadow-inner"
              playsInline
              muted
            />

            {/* Scanning Overlay */}
            {isScanning && (
              <div className="absolute inset-0 rounded-xl">
                <div className="absolute inset-4 border-2 border-musica-gold rounded-lg">
                  <div className="absolute inset-0">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-musica-gold rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-musica-gold rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-musica-gold rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-musica-gold rounded-br-lg"></div>
                  </div>
                  {/* Scanning line animation */}
                  <div className="absolute inset-0 overflow-hidden rounded-lg">
                    <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-musica-gold to-transparent animate-pulse"></div>
                  </div>
                </div>
              </div>
            )}

            {/* No camera state */}
            {!hasCamera && (
              <div className="absolute inset-0 bg-musica-burgundy/10 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-musica-burgundy/40 mx-auto mb-3" />
                  <p className="text-musica-burgundy/60">
                    Camera not available
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center mt-6">
            {!isScanning ? (
              <button
                onClick={startScanning}
                className="bg-musica-gold hover:bg-musica-gold/90 text-musica-burgundy px-8 py-3 rounded-full font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Camera className="w-5 h-5" />
                <span>Start Scanning</span>
              </button>
            ) : (
              <button
                onClick={stopScanning}
                className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl"
              >
                <X className="w-5 h-5" />
                <span>Stop Scanning</span>
              </button>
            )}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm text-center">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* JWT Decoder */}
      {decodedJWT && (
        <JWTDecoder decodedJWT={decodedJWT} onCopy={copyToClipboard} />
      )}

      {/* Scan Result */}
      {scanResult && !decodedJWT && (
        <div className="bg-emerald-50/80 backdrop-blur-lg border border-emerald-200 rounded-2xl p-6 shadow-lg">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-emerald-700 font-semibold">Latest Scan</h3>
            <button
              onClick={() => setScanResult(null)}
              className="text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white/60 rounded-lg p-4 mb-4 border border-emerald-100">
            <p className="text-musica-burgundy font-mono text-sm break-all">
              {scanResult}
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => copyToClipboard(scanResult)}
              className="flex-1 bg-musica-burgundy hover:bg-musica-burgundy/90 text-musica-cream px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </button>

            {isUrl(scanResult) && (
              <button
                onClick={() => window.open(scanResult, "_blank")}
                className="flex-1 bg-musica-gold hover:bg-musica-gold/90 text-musica-burgundy px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Open Link
              </button>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div className="bg-white/80 backdrop-blur-lg border border-musica-burgundy/10 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-musica-burgundy font-semibold">Scan History</h3>
            {scanHistory.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-red-500 hover:text-red-600 text-sm transition-colors font-medium"
              >
                Clear All
              </button>
            )}
          </div>

          {scanHistory.length === 0 ? (
            <p className="text-musica-burgundy/60 text-center py-8">
              No scans yet
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {scanHistory.map((scan) => (
                <div
                  key={scan.id}
                  className="bg-musica-cream/50 rounded-lg p-4 border border-musica-burgundy/5"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 mr-3">
                      <div className="flex items-center space-x-2 mb-1">
                        {scan.isJWT && (
                          <span className="bg-musica-gold/20 text-musica-burgundy px-2 py-1 rounded text-xs font-medium border border-musica-gold/30">
                            JWT
                          </span>
                        )}
                        {isUrl(scan.text) && (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-medium border border-emerald-200">
                            URL
                          </span>
                        )}
                      </div>
                      <p className="text-musica-burgundy font-mono text-sm break-all">
                        {scan.text.length > 100
                          ? `${scan.text.substring(0, 100)}...`
                          : scan.text}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(scan.text)}
                      className="text-musica-burgundy/60 hover:text-musica-burgundy transition-colors flex-shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-musica-burgundy/50 text-xs mb-2">
                    {scan.timestamp.toLocaleString()}
                  </p>

                  <div className="flex space-x-2">
                    {isUrl(scan.text) && (
                      <button
                        onClick={() => window.open(scan.text, "_blank")}
                        className="text-musica-gold hover:text-musica-gold/80 text-xs transition-colors font-medium"
                      >
                        Open Link →
                      </button>
                    )}
                    {scan.isJWT && scan.decodedJWT && (
                      <button
                        onClick={async () => {
                          setScanResult(scan.text);
                          try {
                            const decodedJWTData = await decodeJWT(scan.text);
                            setDecodedJWT(decodedJWTData);
                          } catch (error) {
                            console.error("JWT decoding error:", error);
                            setDecodedJWT(scan.decodedJWT!);
                          }
                        }}
                        className="text-musica-gold hover:text-musica-gold/80 text-xs transition-colors font-medium"
                      >
                        View JWT →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
