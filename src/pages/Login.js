import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Check if vendor exists and is approved in EventTicketRegistration
      const vendorSnapshot = await db.collection("EventTicketRegistration")
        .where("email", "==", email.trim())
        .get();

      if (vendorSnapshot.empty) {
        throw new Error("No vendor account found with this email.");
      }

      let isApproved = false;
      vendorSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'approved' || data.isVerified === true) {
          isApproved = true;
        }
      });

      if (!isApproved) {
        throw new Error("Your account is not approved yet. Please contact admin.");
      }

      // 2. Sign in with Firebase Auth
      await signInWithEmailAndPassword(auth, email.trim(), password);
      
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to login. Please check your credentials.");
      auth.signOut(); // Ensure they are signed out if not approved
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Vendor Portal</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your registered email"
              required 
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required 
            />
          </div>
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Logging in...' : 'Login to Dashboard'}
          </button>
          
          {error && <div className="error-message">{error}</div>}
        </form>
      </div>
    </div>
  );
}

export default Login;
