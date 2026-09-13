import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';


function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailLower = email.toLowerCase().trim();
      
      // 1. Check if vendor exists directly
      let vendorSnapshot = await db.collection("EventTicketRegistration")
        .where("email", "==", emailLower)
        .get();

      // If not primary vendor, check if staff
      if (vendorSnapshot.empty) {
        vendorSnapshot = await db.collection("EventTicketRegistration")
          .where("accessEmails", "array-contains", emailLower)
          .get();
          
        if (vendorSnapshot.empty) {
          throw new Error("No vendor or staff account found with this email.");
        }
      }

      // 2. Check if the parent organizer is approved
      let isApproved = false;
      vendorSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'approved' || data.isVerified === true) {
          isApproved = true;
        }
      });

      if (!isApproved) {
        throw new Error("The associated organizer account is not approved yet.");
      }

      // 3. Sign in with Firebase Auth
      await signInWithEmailAndPassword(auth, emailLower, password);
      
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
        <h2 style={{ marginTop: 0, textAlign: 'center', marginBottom: '1.5rem' }}>Vendor Portal</h2>
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
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required 
                style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
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
