import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { db } from '../firebase';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import firebase from 'firebase/compat/app';

function Scanner({ user }) {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdgePercentage = 0.7; // 70% of the screen width/height
          const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
          return {
            width: qrboxSize,
            height: qrboxSize
          };
        },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
      },
      false
    );

    scannerRef.current = scanner;

    const onScanSuccess = async (decodedText) => {
      if (isProcessing) return; // Prevent multiple scans at once
      
      setIsProcessing(true);
      scanner.pause(true); // Pause scanning while checking DB

      try {
        const cleanEmail = user.email.toLowerCase().trim();
        const rootCollectionName = `${cleanEmail}_ticket`;
        const ticketRef = db.collection(rootCollectionName);
        
        // QR value is either the document ID or bookingId.
        // We will try finding the doc by ID first.
        let ticketDoc = await ticketRef.doc(decodedText).get();
        
        if (!ticketDoc.exists) {
          // Try searching by bookingId
          const snapshot = await ticketRef.where("bookingId", "==", decodedText).limit(1).get();
          if (!snapshot.empty) {
            ticketDoc = snapshot.docs[0];
          }
        }

        if (!ticketDoc || !ticketDoc.exists) {
          setScanResult({
            status: 'error',
            message: 'Invalid Ticket. Ticket not found in your records.'
          });
          return;
        }

        const data = ticketDoc.data();

        if (data.visited || (data.visits && data.visits.visited)) {
          setScanResult({
            status: 'warning',
            message: 'TICKET ALREADY SCANNED!',
            data: data
          });
        } else {
          // Mark as visited
          await ticketDoc.ref.update({
            visited: true, // Legacy compatibility
            'visits.visited': true,
            'visits.visitedAt': new Date().toISOString(),
            scannedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          setScanResult({
            status: 'success',
            message: 'ACCESS GRANTED',
            data: data
          });
        }
      } catch (err) {
        console.error("Scan Error:", err);
        setScanResult({
          status: 'error',
          message: 'Error processing ticket: ' + err.message
        });
      } finally {
        setIsProcessing(false);
      }
    };

    const onScanError = (err) => {
      // Ignored for UX
    };

    scanner.render(onScanSuccess, onScanError);

    return () => {
      scanner.clear().catch(console.error);
    };
  }, [user, isProcessing]);

  const handleReset = () => {
    setScanResult(null);
    if (scannerRef.current) {
      scannerRef.current.resume();
    }
  };

  return (
    <div className="scanner-container">
      <div className="scanner-box">
        <div id="reader"></div>
        {isProcessing && <div className="processing-overlay">Processing...</div>}
      </div>

      {scanResult && (
        <div className="scan-result-overlay">
          <div className={`scan-result-card ${scanResult.status}`}>
            <div className="result-icon">
              {scanResult.status === 'success' && <CheckCircle size={48} color="var(--success-color)" />}
              {scanResult.status === 'error' && <XCircle size={48} color="var(--error-color)" />}
              {scanResult.status === 'warning' && <AlertTriangle size={48} color="var(--warning-color)" />}
            </div>
            
            <h3>{scanResult.message}</h3>
            
            {scanResult.data && (
              <div className="ticket-details">
                <div className="detail-row">
                  <span>Customer</span>
                  <span>{scanResult.data.customerName || `${scanResult.data.firstName || ''} ${scanResult.data.lastName || ''}`.trim() || 'Unknown'}</span>
                </div>
                <div className="detail-row">
                  <span>Phone</span>
                  <span>{scanResult.data.customerPhone || scanResult.data.phone || 'No Phone'}</span>
                </div>
                <div className="detail-row">
                  <span>Passes</span>
                  <span>
                    {scanResult.data.passes && scanResult.data.passes.map(p => `${p.quantity}x ${p.name}`).join(', ')}
                  </span>
                </div>
                <div className="detail-row">
                  <span>Total Paid</span>
                  <span>₹{scanResult.data.totalAmount}</span>
                </div>
              </div>
            )}

            <button onClick={handleReset} className="primary-btn">
              Scan Next Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Scanner;
