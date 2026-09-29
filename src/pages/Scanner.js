import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../firebase';
import { CheckCircle, XCircle, AlertTriangle, RefreshCcw, Flashlight, FlashlightOff, Search } from 'lucide-react';
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);
  
  const [vendorPassIds, setVendorPassIds] = useState(new Set());
  const vendorPassIdsRef = useRef(new Set());
  
  useEffect(() => {
    vendorPassIdsRef.current = vendorPassIds;
  }, [vendorPassIds]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchOpen(false);
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Use vendorData email if available, otherwise fallback to user.email
  const cleanEmail = (vendorData?.email || user.email).toLowerCase().trim();
  // Fetch vendor EventTicketRegistration docId and passes
  useEffect(() => {
    db.collection("EventTicketRegistration")
      .where("email", "==", cleanEmail)
      .limit(1)
      .get()
      .then((snap) => {
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          const passIds = new Set(
            docData.passes ? docData.passes.map(p => p.passId).filter(Boolean) : []
          );
          setVendorPassIds(passIds);
        }
      })
      .catch((err) => console.error("Error fetching vendor doc:", err));
  }, [cleanEmail]);

  // Fetch all tickets for search on mount when vendorPassIds are available
  useEffect(() => {
    if (vendorPassIds.size === 0) return;
    const rootCollectionName = `Payments/EventTickets/Transactions`;

    const unsubscribe = db.collection(rootCollectionName)
      .onSnapshot((snapshot) => {
        const fetchedRecords = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.payment && data.payment.razorpayPaymentId) {
            const hasVendorPass = data.passes && data.passes.some(p => vendorPassIds.has(p.passId));
            if (hasVendorPass) {
              fetchedRecords.push({ id: doc.id, ...data });
            }
          }
        });
        setAllTickets(fetchedRecords);
      }, (err) => {
        console.error("Error fetching tickets for search: ", err);
      });

    return () => unsubscribe();
  }, [vendorPassIds]);

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

    // Cleanup handled in the second useEffect to avoid race conditions
  }, []);

  useEffect(() => {
    if (cameras.length === 0) return;
    
    let isMounted = true;

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
        
        // If the component unmounted while the camera was starting up
        if (!isMounted) {
          if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().then(() => {
              if (html5QrCodeRef.current) html5QrCodeRef.current.clear();
            }).catch(console.error);
          }
          return;
        }

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

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current) {
        const scanner = html5QrCodeRef.current;
        html5QrCodeRef.current = null; // Prevent re-use of stale instance
        if (scanner.isScanning) {
          scanner.stop().then(() => {
            scanner.clear();
          }).catch(console.error);
        } else {
          try { scanner.clear(); } catch(e) {}
        }
      }
    };
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

    // Basic validation to prevent invalid segment errors (e.g., from UPI QR codes)
    if (!decodedText || typeof decodedText !== 'string' || decodedText.includes('/')) {
      setScanResult({
        status: 'error',
        message: 'Invalid Ticket Format. Please scan a valid event ticket QR code.'
      });
      setIsProcessing(false);
      isProcessingRef.current = false;
      return;
    }

    try {
      const rootCollectionName = `Payments/EventTickets/Transactions`;
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

      const hasVendorPass = data.passes && data.passes.some(p => vendorPassIdsRef.current.has(p.passId));

      if (!hasVendorPass) {
        setScanResult({
          status: 'error',
          message: 'Invalid Ticket. This ticket does not belong to your event.'
        });
        setIsProcessing(false);
        isProcessingRef.current = false;
        return;
      }

      if (!data.payment || !data.payment.razorpayPaymentId) {
        setScanResult({
          status: 'error',
          message: 'Payment Not Valid. No valid payment ID found.'
        });
        setIsProcessing(false);
        isProcessingRef.current = false;
        return;
      }

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
    setIsSearchOpen(false);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch (e) {
      console.warn("Scanner pause error:", e);
    }
  };



  return (
    <div className="scanner-container">
      
      {/* Header Overlay */}
      <div ref={searchContainerRef} className="scanner-search-container" style={{ display: 'flex', flexDirection: 'column', width: '90%', maxWidth: '400px', pointerEvents: 'auto' }}>
        
        {/* Top Row: Logo & Search Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', width: '100%' }}>
          <img src="/DayToBook_Bg_tRANSPARET_Logo.png" alt="DayToBook" style={{ width: '40vw', maxWidth: '200px', objectFit: 'contain' }} />
          
          <div 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            style={{ position: 'absolute', left: 0, cursor: 'pointer', background: 'var(--nav-bg)', borderRadius: '50%', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', backdropFilter: 'blur(10px)' }}
          >
            <Search size={20} color={isSearchOpen ? "var(--error-color)" : "var(--primary-color)"} />
          </div>
        </div>

        {/* Expandable Search Bar */}
        <div style={{ 
          overflow: showDropdown ? 'visible' : 'hidden', 
          transition: 'all 0.3s ease-in-out', 
          maxHeight: isSearchOpen ? (showDropdown ? '600px' : '60px') : '0px', 
          opacity: isSearchOpen ? 1 : 0, 
          marginTop: isSearchOpen ? '10px' : '0px',
          width: '100%',
          pointerEvents: isSearchOpen ? 'auto' : 'none'
        }}>
          <div style={{ position: 'relative' }}>
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
        </div>
      </div>

      <div className="scanner-box">
        <div id="reader"></div>
        {/* Gradient Overlay */}
        <div className="scanner-gradient-overlay"></div>
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

      {/* Refresh Scanner Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '15px', zIndex: 10, position: 'relative' }}>
        <button 
          onClick={() => window.location.reload()} 
          style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            padding: '10px 20px', borderRadius: '8px', 
            background: 'var(--nav-bg, #1a1a1a)', color: 'var(--text-primary, #fff)', 
            border: '1px solid var(--border-color, #333)', cursor: 'pointer', fontWeight: 'bold' 
          }}
        >
          <RefreshCcw size={18} /> Refresh Scanner
        </button>
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
