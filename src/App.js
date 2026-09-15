import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ScanLine, ListChecks, User, KeyRound, Download, X } from 'lucide-react';

import Login from './pages/Login';
import Scanner from './pages/Scanner';
import Records from './pages/Records';
import Profile from './pages/Profile';
import Access from './pages/Access';
import './App.css';

import { requestAndSaveOrganizerToken } from './services/notificationService';

function Nav({ vendorData }) {
  const location = useLocation();
  const access = vendorData?.access || [];
  
  return (
    <nav className="bottom-nav">
      {access.includes('scan') && (
        <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
          <ScanLine size={24} />
          <span>Scan</span>
        </Link>
      )}
      {access.includes('records') && (
        <Link to="/records" className={`nav-item ${location.pathname === '/records' ? 'active' : ''}`}>
          <ListChecks size={24} />
          <span>Records</span>
        </Link>
      )}
      {access.includes('access') && (
        <Link to="/access" className={`nav-item ${location.pathname === '/access' ? 'active' : ''}`}>
          <KeyRound size={24} />
          <span>Access</span>
        </Link>
      )}
      {access.includes('profile') && (
        <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
          <User size={24} />
          <span>Profile</span>
        </Link>
      )}
    </nav>
  );
}

function InstallPrompt({ onClose }) {
  const handleDownloadApp = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert("To install on iOS: Tap the 'Share' icon at the bottom of your Safari browser, then select 'Add to Home Screen'.");
      onClose();
      return;
    }

    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      window.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        window.deferredPrompt = null;
        onClose();
      });
    } else {
      alert("App is already installed, or installation is not supported on this browser.");
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        background: 'var(--bg-color)', padding: '2rem', borderRadius: '12px',
        width: '100%', maxWidth: '350px', textAlign: 'center', position: 'relative',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '10px', right: '10px', background: 'transparent',
          border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '5px'
        }}>
          <X size={20} />
        </button>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Install App</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: '1.4' }}>
          Install the DayToBook Vendor App on your device for a faster and better experience!
        </p>
        <button onClick={handleDownloadApp} className="primary-btn" style={{
          backgroundColor: 'var(--primary-color)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.8rem',
          border: 'none', borderRadius: '8px', color: '#fff', fontSize: '1rem', cursor: 'pointer'
        }}>
          <Download size={18} />
          Download App (APK / iOS)
        </button>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [vendorData, setVendorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    if (user && vendorData) {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      const hasDismissed = sessionStorage.getItem('installPromptDismissed');
      
      if (!isStandalone && !hasDismissed) {
        setShowInstallPrompt(true);
      }
    }
  }, [user, vendorData]);

  const handleCloseInstallPrompt = () => {
    setShowInstallPrompt(false);
    sessionStorage.setItem('installPromptDismissed', 'true');
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  useEffect(() => {
    if (vendorData?.email) {
      requestAndSaveOrganizerToken(vendorData.email);
    }
  }, [vendorData?.email]);

  useEffect(() => {
    let unsubscribeSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const email = currentUser.email.toLowerCase().trim();
          
          let vendorQuery = db.collection("EventTicketRegistration").where("email", "==", email);
          let snapshot = await vendorQuery.get();
          
          let role = 'organizer';
          if (snapshot.empty) {
            vendorQuery = db.collection("EventTicketRegistration").where("accessEmails", "array-contains", email);
            snapshot = await vendorQuery.get();
            role = 'staff';
          }

          if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            
            // Cleanup previous snapshot if any
            if (unsubscribeSnapshot) unsubscribeSnapshot();

            // Setup real-time listener
            unsubscribeSnapshot = db.collection("EventTicketRegistration").doc(docId).onSnapshot((doc) => {
              if (doc.exists) {
                const orgData = doc.data();
                if (role === 'organizer') {
                  setVendorData({ 
                    email: orgData.email, 
                    role: 'organizer', 
                    access: ['scan', 'records', 'access', 'profile'] 
                  });
                  setUser(currentUser);
                } else {
                  const accessObj = (orgData.access || []).find(a => a.email === email);
                  // If staff was removed, log them out
                  if (!accessObj && !(orgData.accessEmails || []).includes(email)) {
                    auth.signOut();
                  } else {
                    setVendorData({ 
                      email: orgData.email,
                      role: 'staff',
                      access: accessObj ? accessObj.pages : []
                    });
                    setUser(currentUser);
                  }
                }
              }
              setLoading(false);
            });
          } else {
            // Not found
            await auth.signOut();
            setUser(null);
            setVendorData(null);
            setLoading(false);
          }
        } catch (err) {
          console.error("Auth state processing error", err);
          await auth.signOut();
          setUser(null);
          setVendorData(null);
          setLoading(false);
        }
      } else {
        setUser(null);
        setVendorData(null);
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  const getFallbackRoute = (access) => {
    if (!access || access.length === 0) return '/login';
    if (access.includes('scan')) return '/';
    if (access.includes('records')) return '/records';
    if (access.includes('access')) return '/access';
    if (access.includes('profile')) return '/profile';
    return '/login';
  };

  const showNav = user && vendorData && vendorData.access && vendorData.access.length > 1;

  return (
    <Router>
      <div className={`app-container ${showNav ? 'has-nav' : ''}`}>
        <div className="main-content">
          <Routes>
            <Route path="/login" element={user && vendorData ? <Navigate to={getFallbackRoute(vendorData.access)} /> : <Login />} />
            <Route path="/" element={
              user && vendorData ? (
                vendorData.access.includes('scan') ? <Scanner user={user} vendorData={vendorData} /> : <Navigate to={getFallbackRoute(vendorData.access)} />
              ) : <Navigate to="/login" />
            } />
            <Route path="/records" element={
              user && vendorData ? (
                vendorData.access.includes('records') ? <div className="page-container"><Records user={user} vendorData={vendorData} /></div> : <Navigate to={getFallbackRoute(vendorData.access)} />
              ) : <Navigate to="/login" />
            } />
            <Route path="/access" element={
              user && vendorData ? (
                vendorData.access.includes('access') ? <div className="page-container"><Access user={user} vendorData={vendorData} /></div> : <Navigate to={getFallbackRoute(vendorData.access)} />
              ) : <Navigate to="/login" />
            } />
            <Route path="/profile" element={
              user && vendorData ? (
                vendorData.access.includes('profile') ? <div className="page-container"><Profile user={user} vendorData={vendorData} /></div> : <Navigate to={getFallbackRoute(vendorData.access)} />
              ) : <Navigate to="/login" />
            } />
          </Routes>
        </div>
        {showNav && <Nav vendorData={vendorData} />}
        {showInstallPrompt && <InstallPrompt onClose={handleCloseInstallPrompt} />}
      </div>
    </Router>
  );
}

export default App;
