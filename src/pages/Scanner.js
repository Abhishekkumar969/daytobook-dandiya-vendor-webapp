import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../firebase';
import { CheckCircle, XCircle, AlertTriangle, RefreshCcw, Zap, ZapOff } from 'lucide-react';
import firebase from 'firebase/compat/app';

function Scanner({ user }) {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  
  const html5QrCodeRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    // 1. Get cameras
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        
        // Try to find a back camera
        let backCameraIndex = devices.findIndex(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('environment') ||
          device.label.toLowerCase().includes('rear')
        );
        
        if (backCameraIndex !== -1) {
          setActiveCameraIndex(backCameraIndex);
        } else {
          setActiveCameraIndex(0); // fallback to first
        }
      }
    }).catch(err => {
      console.error("Error getting cameras", err);
    });

    // Cleanup
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    if (cameras.length === 0) return;
    
    const startScanner = async () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop().catch(console.error);
      }

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("reader");
      }
      
      const cameraId = cameras[activeCameraIndex].id;
      setTorchOn(false); // Reset torch state on camera switch

      try {
        await html5QrCodeRef.current.start(
          cameraId,
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdgePercentage = 0.7;
              const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
              return { width: qrboxSize, height: qrboxSize };
            }
          },
          onScanSuccess,
          onScanError
        );
        
        // Check if torch is supported by this camera
        const track = html5QrCodeRef.current.getRunningTrackCameraCapabilities();
        if (track && typeof track.torch !== 'undefined') {
          setTorchSupported(true);
        } else {
          setTorchSupported(false);
        }

      } catch (err) {
        console.error("Failed to start scanner", err);
      }
    };

    startScanner();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCameraIndex, cameras]);

  const onScanSuccess = async (decodedText) => {
    if (isProcessingRef.current) return;
    
    setIsProcessing(true);
    isProcessingRef.current = true;
    
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
    }

    try {
      const cleanEmail = user.email.toLowerCase().trim();
      const rootCollectionName = `${cleanEmail}_ticket`;
      const ticketRef = db.collection(rootCollectionName);
      
      let ticketDoc = await ticketRef.doc(decodedText).get();
      
      if (!ticketDoc.exists) {
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
        await ticketDoc.ref.update({
          visited: true,
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
      isProcessingRef.current = false;
    }
  };

  const onScanError = (err) => {
    // Ignored for UX
  };

  const handleReset = () => {
    setScanResult(null);
    if (html5QrCodeRef.current && !html5QrCodeRef.current.isScanning) {
        // Just in case it was fully stopped
    } else if (html5QrCodeRef.current) {
      html5QrCodeRef.current.resume();
    }
  };

  const toggleCamera = () => {
    if (cameras.length > 1) {
      setActiveCameraIndex((prevIndex) => (prevIndex + 1) % cameras.length);
    }
  };

  const toggleTorch = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning && torchSupported) {
      try {
        await html5QrCodeRef.current.applyVideoConstraints({
          advanced: [{ torch: !torchOn }]
        });
        setTorchOn(!torchOn);
      } catch (err) {
        console.error("Failed to toggle torch", err);
      }
    }
  };

  return (
    <div className="scanner-container">
      <div className="scanner-box">
        <div id="reader"></div>
        {/* Laser Line Overlay */}
        <div className="scanner-overlay">
           <div className="laser-line"></div>
        </div>

        {/* Custom Controls */}
        <div className="scanner-controls">
          {cameras.length > 1 && (
            <button className="icon-btn" onClick={toggleCamera}>
              <RefreshCcw size={24} />
            </button>
          )}
          {torchSupported && (
            <button className="icon-btn" onClick={toggleTorch}>
              {torchOn ? <ZapOff size={24} /> : <Zap size={24} />}
            </button>
          )}
        </div>

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
