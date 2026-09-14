import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../firebase';
import { CheckCircle, XCircle, AlertTriangle, RefreshCcw, Flashlight, FlashlightOff, Search, Download } from 'lucide-react';
import firebase from 'firebase/compat/app';

function Scanner({ user, vendorData }) {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  
  const html5QrCodeRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Search State
  const [allTickets, setAllTickets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [selectedSearchTicket, setSelectedSearchTicket] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Use vendorData email if available, otherwise fallback to user.email
  const cleanEmail = (vendorData?.email || user.email).toLowerCase().trim();

  // Fetch all tickets for search on mount
  useEffect(() => {
    const rootCollectionName = `${cleanEmail}_ticket`;

    const unsubscribe = db.collection(rootCollectionName)
      .onSnapshot((snapshot) => {
        const fetchedRecords = [];
        snapshot.forEach(doc => {
          fetchedRecords.push({ id: doc.id, ...doc.data() });
        });
        setAllTickets(fetchedRecords);
      }, (err) => {
        console.error("Error fetching tickets for search: ", err);
      });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorData?.email]);

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
        
        const activeLabel = cameras[activeCameraIndex]?.label.toLowerCase() || '';
        const isFrontCamera = activeLabel.includes('front') || activeLabel.includes('user');
        const isBackCamera = activeLabel.includes('back') || activeLabel.includes('environment') || activeLabel.includes('rear');
                             
        // Only show flashlight if it's explicitly a back camera, or if it's camera 0 and NOT a front camera.
        if (isFrontCamera) {
          setTorchSupported(false);
        } else if (isBackCamera) {
          setTorchSupported(true);
        } else {
          // Fallback if labels are weird
          setTorchSupported(activeCameraIndex === 0);
        }

      } catch (err) {
        console.error("Failed to start scanner", err);
      }
    };

    startScanner();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCameraIndex, cameras]);

  const processTicketId = async (decodedText) => {
    if (isProcessingRef.current) return;
    
    setIsProcessing(true);
    isProcessingRef.current = true;
    
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.pause(true);
      }
    } catch (e) {
      console.warn("Scanner pause error:", e);
    }
    
    // Clear search UI
    setSelectedSearchTicket(null);
    setShowDropdown(false);
    setSearchQuery('');

    try {
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
        if (navigator.vibrate) navigator.vibrate(200);
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

  const onScanSuccess = async (decodedText) => {
    await processTicketId(decodedText);
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

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTickets([]);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    const results = allTickets.filter(ticket => {
      const name = (ticket.customerName || `${ticket.firstName || ''} ${ticket.lastName || ''}`).toLowerCase();
      const phone = (ticket.customerPhone || ticket.phone || '').toLowerCase();
      const id = (ticket.id || '').toLowerCase();
      const bookingId = (ticket.bookingId || '').toLowerCase();
      
      return name.includes(lowerQuery) || phone.includes(lowerQuery) || id.includes(lowerQuery) || bookingId.includes(lowerQuery);
    });
    
    setFilteredTickets(results);
    
    // Auto-update the selected ticket if it's currently open
    if (selectedSearchTicket) {
      const updatedSelected = results.find(t => t.id === selectedSearchTicket.id);
      if (updatedSelected) {
        setSelectedSearchTicket(updatedSelected);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, allTickets]);

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim() !== '') {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const handleSelectSearchTicket = (ticket) => {
    setSelectedSearchTicket(ticket);
    setShowDropdown(false);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch (e) {
      console.warn("Scanner pause error:", e);
    }
  };

  const handleDownloadApp = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert("To install on iOS: Tap the 'Share' icon at the bottom of your Safari browser, then select 'Add to Home Screen'.");
      return;
    }
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      window.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        window.deferredPrompt = null;
      });
    } else {
      alert("App is already installed, or installation is not supported on this browser.");
    }
  };

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  return (
    <div className="scanner-container">
      
      {/* Search Bar Overlay */}
      <div className="scanner-search-container" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <div className="search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input 
              type="text" 
              className="scanner-search-input"
              placeholder="Search ticket by name or phone..." 
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => { if (filteredTickets.length > 0) setShowDropdown(true); }}
            />
          </div>
          
          {showDropdown && filteredTickets.length > 0 && (
            <div className="search-dropdown">
              {filteredTickets.map(ticket => (
                <div 
                  key={ticket.id} 
                  className="search-result-item"
                  onClick={() => handleSelectSearchTicket(ticket)}
                >
                  <div className="result-tkt" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    {ticket.bookingId || ticket.id}
                  </div>
                  <div className="result-name">{ticket.customerName || `${ticket.firstName || ''} ${ticket.lastName || ''}`.trim() || 'Unknown'}</div>
                  <div className="result-phone">{ticket.customerPhone || ticket.phone}</div>
                  <div className="result-status">
                    {(ticket.visited || (ticket.visits && ticket.visits.visited)) ? <span className="visited-text">Visited</span> : <span className="pending-text">Pending</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {!isStandalone && (
          <button 
            onClick={handleDownloadApp}
            style={{ background: 'var(--bg-surface-light)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', flexShrink: 0 }}
            title="Download App"
          >
            <Download size={20} />
          </button>
        )}
      </div>

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
              {torchOn ? <FlashlightOff size={24} /> : <Flashlight size={24} />}
            </button>
          )}
        </div>

        {isProcessing && <div className="processing-overlay">Processing...</div>}
      </div>

      {/* Manual Search Ticket Details */}
      {selectedSearchTicket && !scanResult && (
        <div className="scan-result-overlay">
          <div className="scan-result-card search-detail-card">
            <h3>Ticket Details</h3>
            <div className="ticket-details" style={{ marginTop: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
              <div className="detail-row">
                <span>TKT ID</span>
                <span style={{ fontSize: '0.85em', wordBreak: 'break-all' }}>{selectedSearchTicket.bookingId || selectedSearchTicket.id}</span>
              </div>
              <div className="detail-row">
                <span>Customer</span>
                <span>{selectedSearchTicket.customerName || `${selectedSearchTicket.firstName || ''} ${selectedSearchTicket.lastName || ''}`.trim() || 'Unknown'}</span>
              </div>
              <div className="detail-row">
                <span>Phone</span>
                <span>{selectedSearchTicket.customerPhone || selectedSearchTicket.phone || 'No Phone'}</span>
              </div>
              <div className="detail-row">
                <span>Passes</span>
                <span>
                  {selectedSearchTicket.passes && selectedSearchTicket.passes.map(p => `${p.quantity}x ${p.name}`).join(', ')}
                </span>
              </div>
              {(selectedSearchTicket.visited || (selectedSearchTicket.visits && selectedSearchTicket.visits.visited)) && (
                <div className="detail-row">
                  <span>Scanned At</span>
                  <span style={{ fontSize: '0.85em', textAlign: 'right' }}>
                    {selectedSearchTicket.scannedAt?.toDate 
                      ? selectedSearchTicket.scannedAt.toDate().toLocaleString('en-IN', { hour12: true, month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }) 
                      : (selectedSearchTicket.visits?.visitedAt 
                          ? new Date(selectedSearchTicket.visits.visitedAt).toLocaleString('en-IN', { hour12: true, month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }) 
                          : 'Unknown Time')}
                  </span>
                </div>
              )}
            </div>
            
            <div className="search-detail-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!(selectedSearchTicket.visited || (selectedSearchTicket.visits && selectedSearchTicket.visits.visited)) ? (
                <button 
                  onClick={() => processTicketId(selectedSearchTicket.bookingId || selectedSearchTicket.id)} 
                  className="primary-btn"
                >
                  Mark as Visit
                </button>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,50,50,0.1)', color: 'var(--error-color)', borderRadius: '8px', fontWeight: 'bold' }}>
                  TICKET ALREADY SCANNED
                </div>
              )}
              <button 
                onClick={() => {
                  setSelectedSearchTicket(null);
                  try {
                    if (html5QrCodeRef.current) html5QrCodeRef.current.resume();
                  } catch (e) {}
                }} 
                className="secondary-btn"
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standard Scan Result Overlay */}
      {scanResult && (
        <div className="scan-result-overlay">
          <div className={`scan-result-card ${scanResult.status}`}>
            <div className="result-icon">
              {scanResult.status === 'success' && <CheckCircle size={48} color="var(--success-color)" />}
              {scanResult.status === 'error' && <XCircle size={48} color="var(--error-color)" />}
              {scanResult.status === 'warning' && <AlertTriangle size={48} color="var(--error-color)" />}
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
                  <span>Scanned At</span>
                  <span style={{ fontSize: '0.85em', textAlign: 'right' }}>
                    {scanResult.status === 'success' 
                      ? 'Just Now'
                      : (scanResult.data.scannedAt?.toDate 
                          ? scanResult.data.scannedAt.toDate().toLocaleString('en-IN', { hour12: true, month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }) 
                          : (scanResult.data.visits?.visitedAt 
                              ? new Date(scanResult.data.visits.visitedAt).toLocaleString('en-IN', { hour12: true, month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }) 
                              : 'Unknown Time'))}
                  </span>
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
