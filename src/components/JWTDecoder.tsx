import React from 'react';
import { Key, Clock, User, Shield, Copy, ChevronDown, ChevronUp, CheckCircle, XCircle, Music, Hash, Tag, Database, Loader } from 'lucide-react';
import { DecodedJWT, formatJWTPayload } from '../utils/jwtDecoder';
import { verifyParticipantData, VerificationResult, ParticipantData } from '../utils/participantVerifier';

interface JWTDecoderProps {
  decodedJWT: DecodedJWT;
  onCopy: (text: string) => void;
}

export default function JWTDecoder({ decodedJWT, onCopy }: JWTDecoderProps) {
  const [showHeader, setShowHeader] = React.useState(false);
  const [showRawPayload, setShowRawPayload] = React.useState(false);
  const [dbVerification, setDbVerification] = React.useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);

  const participantData: ParticipantData = React.useMemo(() => {
    return decodedJWT.payload.data || {};
  }, [decodedJWT.payload.data]);

  // Run database verification when component loads
  React.useEffect(() => {
    if (decodedJWT.isValid && decodedJWT.isSignatureValid && participantData.id) {
      setIsVerifying(true);
      verifyParticipantData(participantData)
        .then(result => {
          setDbVerification(result);
        })
        .catch(error => {
          setDbVerification({
            isVerified: false,
            error: error.message || 'Verification failed'
          });
        })
        .finally(() => {
          setIsVerifying(false);
        });
    }
  }, [decodedJWT.isValid, decodedJWT.isSignatureValid, participantData]);

  if (!decodedJWT.isValid) {
    return (
      <div className="bg-red-50/80 backdrop-blur-lg border border-red-200 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center space-x-3 mb-3">
          <Shield className="w-5 h-5 text-red-600" />
          <h3 className="text-red-700 font-semibold">Invalid JWT Token</h3>
        </div>
        <p className="text-red-600 text-sm">{decodedJWT.error}</p>
      </div>
    );
  }

  // Check if token is expired
  const isExpired = decodedJWT.payload.exp && Date.now() / 1000 > decodedJWT.payload.exp;
  
  return (
    <div className="bg-musica-gold/10 backdrop-blur-lg border border-musica-gold/30 rounded-2xl p-6 space-y-4 shadow-lg">
      <div className="flex items-center space-x-3 mb-4">
        <Key className="w-5 h-5 text-musica-burgundy" />
        <h3 className="text-musica-burgundy font-semibold">JWT Token Decoded</h3>
        {isExpired && (
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium border border-red-200">
            Expired
          </span>
        )}
      </div>

      {/* Token Status */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/60 rounded-lg p-3 border border-musica-burgundy/10">
          <div className="flex items-center space-x-2 mb-1">
            <Shield className="w-4 h-4 text-musica-burgundy/60" />
            <span className="text-musica-burgundy/60 text-sm">Algorithm</span>
          </div>
          <span className="text-musica-burgundy text-sm font-medium">
            {decodedJWT.header.alg || 'Unknown'}
          </span>
        </div>

        <div className="bg-white/60 rounded-lg p-3 border border-musica-burgundy/10">
          <div className="flex items-center space-x-2 mb-1">
            {decodedJWT.isSignatureValid ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            <span className="text-musica-burgundy/60 text-sm">Signature</span>
          </div>
          <span className={`text-sm font-medium ${decodedJWT.isSignatureValid ? 'text-emerald-600' : 'text-red-600'}`}>
            {decodedJWT.isSignatureValid ? 'Verified' : 'Invalid'}
          </span>
        </div>

        <div className="bg-white/60 rounded-lg p-3 border border-musica-burgundy/10">
          <div className="flex items-center space-x-2 mb-1">
            {isVerifying ? (
              <Loader className="w-4 h-4 text-musica-burgundy/60 animate-spin" />
            ) : dbVerification?.isVerified ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            <span className="text-musica-burgundy/60 text-sm">Database</span>
          </div>
          <span className={`text-sm font-medium ${
            isVerifying 
              ? 'text-musica-burgundy/60' 
              : dbVerification?.isVerified 
                ? 'text-emerald-600' 
                : 'text-red-600'
          }`}>
            {isVerifying ? 'Verifying...' : dbVerification?.isVerified ? 'Verified' : 'Unverified'}
          </span>
        </div>
      </div>

      {/* Database Verification Error */}
      {dbVerification?.error && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-1">
            <Database className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700 text-sm font-medium">Database Verification Note</span>
          </div>
          <p className="text-amber-600 text-xs">{dbVerification.error}</p>
        </div>
      )}

      {/* Participant Information */}
      <div className="bg-white/60 rounded-lg border border-musica-burgundy/10 overflow-hidden">
        <div className="bg-musica-burgundy/5 px-4 py-3 border-b border-musica-burgundy/10">
          <h4 className="text-musica-burgundy font-semibold flex items-center space-x-2">
            <Music className="w-4 h-4" />
            <span>Participant Information</span>
          </h4>
        </div>
        
        <div className="divide-y divide-musica-burgundy/5">
          {participantData.id && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Participant ID</span>
              </div>
              <span className="text-musica-burgundy font-mono text-sm">{participantData.id}</span>
            </div>
          )}

          {participantData.eventId && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Event ID</span>
              </div>
              <span className="text-musica-burgundy font-mono text-sm">{participantData.eventId}</span>
            </div>
          )}
          
          {participantData.name && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Name</span>
              </div>
              <span className="text-musica-burgundy font-medium text-sm">{participantData.name}</span>
            </div>
          )}
          
          {participantData.songTitle && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Music className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Song Title</span>
              </div>
              <span className="text-musica-burgundy font-medium text-sm">{participantData.songTitle}</span>
            </div>
          )}
          
          {participantData.categoryName && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Category</span>
              </div>
              <div className="text-right">
                <span className="text-musica-burgundy font-medium text-sm">{participantData.categoryName}</span>
                {participantData.categoryId && (
                  <span className="text-musica-burgundy/40 text-xs block">ID: {participantData.categoryId}</span>
                )}
              </div>
            </div>
          )}
          
          {participantData.subCategoryName && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Sub Category</span>
              </div>
              <div className="text-right">
                <span className="text-musica-burgundy font-medium text-sm">{participantData.subCategoryName}</span>
                {participantData.subCategoryId && (
                  <span className="text-musica-burgundy/40 text-xs block">ID: {participantData.subCategoryId}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Header Section */}
      <div className="border-t border-musica-burgundy/20 pt-4">
        <button
          onClick={() => setShowHeader(!showHeader)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-musica-burgundy font-medium">Technical Details</span>
          {showHeader ? (
            <ChevronUp className="w-4 h-4 text-musica-burgundy/60" />
          ) : (
            <ChevronDown className="w-4 h-4 text-musica-burgundy/60" />
          )}
        </button>
        
        {showHeader && (
          <div className="mt-3 space-y-3">
            <div className="bg-musica-cream/50 rounded-lg p-4 border border-musica-burgundy/10">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-musica-burgundy font-medium text-sm">Header</h5>
                <button
                  onClick={() => onCopy(JSON.stringify(decodedJWT.header, null, 2))}
                  className="text-musica-gold hover:text-musica-gold/80 text-xs flex items-center space-x-1 transition-colors font-medium"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>
              <pre className="text-musica-burgundy text-xs font-mono overflow-x-auto">
                {JSON.stringify(decodedJWT.header, null, 2)}
              </pre>
            </div>
            
            <div className="bg-musica-cream/50 rounded-lg p-4 border border-musica-burgundy/10">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-musica-burgundy font-medium text-sm">Raw Payload</h5>
                <button
                  onClick={() => onCopy(JSON.stringify(decodedJWT.payload, null, 2))}
                  className="text-musica-gold hover:text-musica-gold/80 text-xs flex items-center space-x-1 transition-colors font-medium"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>
              <pre className="text-musica-burgundy text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(decodedJWT.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}