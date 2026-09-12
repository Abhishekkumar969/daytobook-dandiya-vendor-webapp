import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ScanLine, ListChecks, User } from 'lucide-react';

import Login from './pages/Login';
import Scanner from './pages/Scanner';
import Records from './pages/Records';
import Profile from './pages/Profile';
import './App.css';

function Nav() {
  const location = useLocation();
  return (
    <nav className="bottom-nav">
      <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
        <ScanLine size={24} />
        <span>Scan</span>
      </Link>
      <Link to="/records" className={`nav-item ${location.pathname === '/records' ? 'active' : ''}`}>
        <ListChecks size={24} />
        <span>Records</span>
      </Link>
      <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
        <User size={24} />
        <span>Profile</span>
      </Link>
    </nav>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return (
    <Router>
      <div className="app-container">
        <div className="main-content">
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
            <Route path="/" element={user ? <Scanner user={user} /> : <Navigate to="/login" />} />
            <Route path="/records" element={user ? <div className="page-container"><Records user={user} /></div> : <Navigate to="/login" />} />
            <Route path="/profile" element={user ? <div className="page-container"><Profile user={user} /></div> : <Navigate to="/login" />} />
          </Routes>
        </div>
        {user && <Nav />}
      </div>
    </Router>
  );
}

export default App;
