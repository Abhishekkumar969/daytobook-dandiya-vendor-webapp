import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { CheckCircle, Clock, Search } from 'lucide-react';
import { subscribeToOrganizerNotifications } from '../services/notificationService';


function Records({ user, vendorData }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null); // { message: '', type: 'success' | 'error' }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const cleanEmail = (vendorData?.email || user.email).toLowerCase().trim();
    const rootCollectionName = `Payments/EventTickets/Transactions`;


    const unsubscribe = db.collection(rootCollectionName)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        const fetchedRecords = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.payment && data.payment.razorpayPaymentId) {
            fetchedRecords.push({ id: doc.id, ...data });
          }
        });
        setRecords(fetchedRecords);
        setLoading(false);
      }, (err) => {
        console.error("Error fetching records: ", err);
        setLoading(false);
      });

    const unsubscribeNotifs = subscribeToOrganizerNotifications(cleanEmail, (notifs) => {
      if (notifs && notifs.length > 0) {
        const latest = notifs[0];
        // If created in the last 15 seconds, show live toast
        const isRecent = latest.createdAt?.seconds && (Date.now() / 1000 - latest.createdAt.seconds < 15);
        if (isRecent) {
          showToast(latest.title || latest.body, latest.type === 'pass_limit_alert' ? 'error' : 'success');
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeNotifs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorData?.email]);

  if (loading) {
    return <div className="loading-screen">Loading Records...</div>;
  }

  // Calculate stats
  const rawTotalRevenue = records.reduce((acc, r) => {
    const passTotal = r.subtotal || (r.passes ? r.passes.reduce((passAcc, p) => passAcc + ((Number(String(p.price).replace(/[^0-9.-]+/g, "")) || 0) * (Number(p.quantity) || 1)), 0) : 0);
    return acc + (Number(passTotal) || Number(r.totalAmount) || 0);
  }, 0);

  const totalRevenue = rawTotalRevenue;
  const totalTickets = records.reduce((acc, r) => {
    if (r.passes && Array.isArray(r.passes)) {
      return acc + r.passes.reduce((passAcc, p) => passAcc + (Number(p.quantity) || 0), 0);
    }
    return acc + 1;
  }, 0);

  const totalVisited = records.reduce((acc, r) => {
    if (r.visited || (r.visits && r.visits.visited)) {
      if (r.passes && Array.isArray(r.passes)) {
        return acc + r.passes.reduce((passAcc, p) => passAcc + (Number(p.quantity) || 0), 0);
      }
      return acc + 1;
    }
    return acc;
  }, 0);





  const filteredRecords = records.filter(record => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    const name = (record.customerName || `${record.firstName || ''} ${record.lastName || ''}`).toLowerCase();
    const email = (record.customerEmail || record.email || '').toLowerCase();
    const txId = (record.transactionId || record.id || '').toLowerCase();
    return name.includes(lowerQuery) || email.includes(lowerQuery) || txId.includes(lowerQuery);
  });

  return (
    <div className="records-container">
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: toast.type === 'success' ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: '500',
          backdropFilter: 'blur(5px)',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : null}
          {toast.message}
        </div>
      )}

      <div className="records-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard Overview</h2>
            <p style={{ margin: '0.2rem 0 0 0' }}>Real-time analytics for your event</p>
          </div>

        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p>₹{totalRevenue}</p>
          <h4>Total Revenue</h4>
        </div>
        <div className="stat-card">
          <p>{totalVisited} / {totalTickets}</p>
          <h4>Checked In</h4>
        </div>
      </div>



      <h3>Recent Bookings</h3>
      
      <div className="search-input-wrapper" style={{ position: 'relative', marginTop: '1rem', marginBottom: '1rem', width: '100%', maxWidth: '400px' }}>
        <Search size={20} className="search-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input 
          type="text" 
          placeholder="Search by name, email, or ID..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '1rem' }}
        />
      </div>

      <div className="records-list">
        {filteredRecords.length === 0 ? (
          <p>No bookings found.</p>
        ) : (
          filteredRecords.map((record) => (
            <div
              key={record.id}
              className="record-item"
              style={{ display: 'block', cursor: 'pointer' }}
              onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="record-info">
                  <h4>{record.customerName || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown Customer'}</h4>
                  <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    {record.passes && record.passes.map(p => `${p.quantity}x ${p.name}${p.price ? ` (${String(p.price).includes('₹') ? p.price : `₹${p.price}`})` : ''}`).join(', ')}
                  </p>
                </div>
                <div className="record-status">
                  {(record.visited || (record.visits && record.visits.visited)) ? (
                    <span className="status-badge visited">
                      <CheckCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Visited
                    </span>
                  ) : (
                    <span className="status-badge pending">
                      <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Pending
                    </span>
                  )}
                </div>
              </div>

              {expandedRecordId === record.id && (
                <div className="record-expanded-details" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Email</strong>
                      {record.customerEmail || record.email || 'N/A'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Transaction ID</strong>
                      {record.transactionId || record.id || 'N/A'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Total Amount (Paid)</strong>
                      ₹{record.subtotal || (record.passes ? record.passes.reduce((acc, p) => acc + ((Number(String(p.price).replace(/[^0-9.-]+/g, "")) || 0) * (Number(p.quantity) || 1)), 0) || record.totalAmount : record.totalAmount)}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Purchased On</strong>
                      {record.createdAt ? (record.createdAt.toDate ? record.createdAt.toDate().toLocaleString() : new Date(record.createdAt).toLocaleString()) : 'N/A'}
                    </div>
                    {(record.visited || (record.visits && record.visits.visited)) && (
                      <div>
                        <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Scanned At</strong>
                        {record.visits?.scannedAt ? (record.visits.scannedAt.toDate ? record.visits.scannedAt.toDate().toLocaleString() : new Date(record.visits.scannedAt).toLocaleString()) : (record.scannedAt ? (record.scannedAt.toDate ? record.scannedAt.toDate().toLocaleString() : new Date(record.scannedAt).toLocaleString()) : 'N/A')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Records;
