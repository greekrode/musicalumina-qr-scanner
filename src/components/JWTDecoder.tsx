import { CheckCircle, Database, Key, Loader, Music, Shield, Tag, User, XCircle } from 'lucide-react';
import React from 'react';
import { DecodedJWT } from '../utils/jwtDecoder';
import { ParticipantData, VerificationResult, verifyParticipantData } from '../utils/participantVerifier';

interface JWTDecoderProps {
  decodedJWT: DecodedJWT;
}

/** Small inline icon showing DB match status for a single field. */
function FieldMatchIcon({ matched }: { matched: boolean | undefined }) {
  if (matched === undefined) return null;
  return matched ? (
    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
  ) : (
    <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
  );
}

export default function JWTDecoder({ decodedJWT }: JWTDecoderProps) {
  const [dbVerification, setDbVerification] = React.useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);

  const participantData: ParticipantData = React.useMemo(() => {
    return decodedJWT.payload.data || {};
  }, [decodedJWT.payload.data]);

  // Run database verification when component loads
  React.useEffect(() => {
    if (decodedJWT.isValid && decodedJWT.isSignatureValid && participantData.name) {
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

  const mf = dbVerification?.matchedFields;

  return (
    <div className="bg-musica-gold/10 backdrop-blur-lg border border-musica-gold/30 rounded-2xl p-6 space-y-4 shadow-lg">
      <div className="flex items-center space-x-3 mb-4">
        <Key className="w-5 h-5 text-musica-burgundy" />
        <h3 className="text-musica-burgundy font-semibold">QR Data</h3>
        {isExpired && (
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium border border-red-200">
            Expired
          </span>
        )}
      </div>

      {/* Token Status */}
      <div className="grid grid-cols-2 gap-4">
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
            ) : dbVerification ? (
              <XCircle className="w-4 h-4 text-red-600" />
            ) : (
              <Database className="w-4 h-4 text-musica-burgundy/40" />
            )}
            <span className="text-musica-burgundy/60 text-sm">Database</span>
          </div>
          <span className={`text-sm font-medium ${
            isVerifying
              ? 'text-musica-burgundy/60'
              : dbVerification?.isVerified
                ? 'text-emerald-600'
                : dbVerification
                  ? 'text-red-600'
                  : 'text-musica-burgundy/40'
          }`}>
            {isVerifying
              ? 'Verifying...'
              : dbVerification?.isVerified
                ? 'Matched'
                : dbVerification
                  ? 'Mismatch'
                  : 'Pending'
            }
          </span>
        </div>
      </div>

      {/* Database Verification Error */}
      {dbVerification?.error && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-1">
            <Database className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700 text-sm font-medium">Verification Note</span>
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

          {participantData.name && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Name</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-musica-burgundy font-medium text-sm">{participantData.name}</span>
                <FieldMatchIcon matched={mf?.name} />
              </div>
            </div>
          )}

          {participantData.songTitle && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Music className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Song Title</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-musica-burgundy font-medium text-sm">{participantData.songTitle}</span>
                <FieldMatchIcon matched={mf?.songTitle} />
              </div>
            </div>
          )}

          {participantData.categoryName && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Category</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-musica-burgundy font-medium text-sm">{participantData.categoryName}</span>
                <FieldMatchIcon matched={mf?.categoryName} />
              </div>
            </div>
          )}

          {participantData.subCategoryName && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-musica-burgundy/60" />
                <span className="text-musica-burgundy/60 text-sm font-medium">Sub Category</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-musica-burgundy font-medium text-sm">{participantData.subCategoryName}</span>
                <FieldMatchIcon matched={mf?.subCategoryName} />
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
