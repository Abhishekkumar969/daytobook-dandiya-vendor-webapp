import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { CheckCircle, Clock } from 'lucide-react';
import { subscribeToOrganizerNotifications } from '../services/notificationService';


function Records({ user, vendorData }) {
  const [records, setRecords] = useState([]);
  const [profileViews, setProfileViews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [toast, setToast] = useState(null); // { message: '', type: 'success' | 'error' }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const cleanEmail = (vendorData?.email || user.email).toLowerCase().trim();
    const rootCollectionName = `${cleanEmail}_ticket`;

    // Fetch vendor profile for passes limits
    db.collection('EventTicketRegistration').where('email', '==', cleanEmail).limit(1).get()
      .then(snap => {
        if (!snap.empty) {
          const doc = snap.docs[0];
          const data = doc.data();
          setProfileViews(data.opened || 0);
        }
      })
      .catch(err => console.error("Error fetching vendor profile passes: ", err));

    const unsubscribe = db.collection(rootCollectionName)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        const fetchedRecords = [];
        snapshot.forEach(doc => {
          fetchedRecords.push({ id: doc.id, ...doc.data() });
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
          <p>{profileViews}</p>
          <h4>Profile Views</h4>
        </div>
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
      <div className="records-list" style={{ marginTop: '1rem' }}>
        {records.length === 0 ? (
          <p>No bookings found.</p>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="record-item"
              style={{ display: 'block', cursor: 'pointer' }}
              onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="record-info">
                  <h4>{record.customerName || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown Customer'}</h4>
                  <p>{record.customerPhone || record.phone || 'No Phone'}</p>
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
